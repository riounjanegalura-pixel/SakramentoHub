<?php

namespace App\Validation;

use App\Support\ParishClock;
use Illuminate\Support\Facades\Validator as ValidatorFactory;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;
use Illuminate\Validation\ValidationException;

/**
 * Full submit-time validation per sacrament (spec §5.1). Rules are validated
 * against form_data as the root so cross-field rules (required_if, after_or_equal)
 * reference plain keys; errors are re-keyed with "formData." when thrown.
 */
final class SacramentRules
{
    public static function validate(string $sacrament, array $formData, ?string $ownerId, ?string $creatorId = null, bool $anyStaffUpload = false): void
    {
        $errors = self::errors($sacrament, $formData, $ownerId, $creatorId, $anyStaffUpload);
        if ($errors !== []) {
            throw ValidationException::withMessages(
                collect($errors)->mapWithKeys(fn ($messages, $key) => ["formData.{$key}" => $messages])->all(),
            );
        }
    }

    /** @return array<string, list<string>> */
    public static function errors(string $sacrament, array $formData, ?string $ownerId, ?string $creatorId = null, bool $anyStaffUpload = false): array
    {
        $doc = fn (bool $required) => [$required ? 'required' : 'nullable', 'string', new OwnedDocument([$ownerId, $creatorId], $anyStaffUpload)];
        $today = ParishClock::todayString();

        $rules = FieldGroups::common($sacrament) + self::documentRules($sacrament, $formData, $doc) + self::contentRules($sacrament, $formData);

        $validator = ValidatorFactory::make($formData, $rules);
        $validator->after(fn (Validator $v) => self::crossField($sacrament, $formData, $v));

        return $validator->errors()->toArray();
    }

    /**
     * The rules for what the form itself asks (not the booking-for question or the documents). Public so the office's
     * walk-in form can be built from the very same rules the server enforces, instead of a second list that could drift.
     *
     * @return array<string, mixed>
     */
    public static function contentRules(string $sacrament, array $formData = []): array
    {
        $today = ParishClock::todayString();

        return match ($sacrament) {
            'baptism' => self::baptism($formData),
            'confirmation' => self::confirmation($today),
            'wedding' => self::wedding($formData, $today),
            'funeral' => self::funeral($formData, $today),
            'anointing' => self::anointing($formData),
            'house-blessing' => self::houseBlessing($formData),
        };
    }

    /** Document rules come from the shared catalogue, never from a second list here. */
    private static function documentRules(string $sacrament, array $d, \Closure $doc): array
    {
        $rules = [];
        foreach (SacramentDocuments::for($sacrament, $d) as $entry) {
            $rules[$entry['key']] = $doc($entry['required']);
        }

        return $rules;
    }

    public const OMIT_REASONS = [
        'Estranged / uncontactable',
        'Sole custody by mother',
        'Sole custody by father',
        'No legal relationship',
        'Other / personal reasons',
    ];

    public const MOTIFS = [
        'N/A', 'None', 'To be determined', 'Classic White', 'White and Gold', 'Navy Blue and Blush Pink',
        'Emerald Green and Gold', 'Dusty Blue and Silver', 'Pastel / Neutral Colors',
        'Simple church decoration only', 'Will confirm color motif once finalized', 'Standard church setup requested',
    ];

    private static function baptism(array $d): array
    {
        $hasFather = ! ($d['fatherOmitted'] ?? false);
        $married = ($d['parentsMarriage'] ?? null) !== 'not_married';

        return [
            'scheduleType' => ['required', 'in:regular,special'],
            'fatherOmitted' => ['required', 'boolean'],
            'fatherOmittedReason' => [$hasFather ? 'nullable' : 'required', Rule::in(self::OMIT_REASONS)],
            'fatherReligion' => [$hasFather ? 'required' : 'nullable', Rule::in(FieldGroups::CATHOLIC_ONLY)],
            // The father can be left out with a reason, the mother cannot: the baptism record always names her. An older
            // client that still offers the choice is told plainly instead of being silently accepted.
            'motherOmitted' => ['nullable', function (string $attribute, mixed $value, \Closure $fail) {
                if (filter_var($value, FILTER_VALIDATE_BOOLEAN)) {
                    $fail("The mother's details cannot be left out.");
                }
            }],
            'motherReligion' => ['required', Rule::in(FieldGroups::CATHOLIC_ONLY)],
            'parentsMarriage' => ['required', 'in:catholic,civil,not_married'],
            'parentsMarriageDate' => [$married ? 'required' : 'nullable', 'date_format:Y-m-d'],
            'parentsMarriagePlace' => [$married ? 'required' : 'nullable', 'string', 'max:255'],
        ]
            + FieldGroups::person('child', ['dob' => true, 'placeOfBirth' => true, 'sex' => true])
            + FieldGroups::person('father', ['required' => $hasFather, 'placeOfBirth' => true])
            + FieldGroups::person('mother', ['required' => true, 'placeOfBirth' => true])
            + FieldGroups::address('parentsResidence')
            + FieldGroups::sponsors(1, 8, 0);
    }

    private static function confirmation(string $today): array
    {
        return [
            'baptismParish' => ['required', 'string', 'max:255'],
            'baptismParishAddress' => ['required', 'string', 'max:255'],
            'baptismDate' => ['required', 'date_format:Y-m-d', "before_or_equal:{$today}"],
        ]
            + FieldGroups::person('confirmand', ['dob' => true, 'placeOfBirth' => true, 'sex' => true])
            + FieldGroups::person('father')
            + FieldGroups::person('mother')
            + FieldGroups::sponsors(1, 1, 16);
    }

    private static function wedding(array $d, string $today): array
    {
        $rules = [
            // The parish marries in church only, in its own church.
            'typeOfMarriage' => ['required', 'in:Church wedding'],
            'venueType' => ['required', 'in:parish'],
            'venueName' => ['nullable', 'string', 'max:255'],
            'venueAddress' => ['nullable', 'string', 'max:255'],
            'candleSponsor' => ['nullable', 'string', 'max:120'],
            'veilSponsor' => ['nullable', 'string', 'max:120'],
            'cordSponsor' => ['nullable', 'string', 'max:120'],
            'motifNotes' => ['required', Rule::in(self::MOTIFS)],
        ] + FieldGroups::sponsors(2, 12, 18);

        foreach (['groom', 'bride'] as $x) {
            $rules += [
                "{$x}FatherCitizenship" => ['required', 'string', 'max:60'],
                "{$x}MotherCitizenship" => ['required', 'string', 'max:60'],
                "{$x}BaptismParish" => ['required', 'string', 'max:255'],
                "{$x}BaptismDate" => ['required', 'date_format:Y-m-d', "before_or_equal:{$today}"],
                "{$x}ConfirmationParish" => ['required', 'string', 'max:255'],
            ]
                + FieldGroups::person($x, [
                    'dob' => true, 'minAgeYears' => 18, 'placeOfBirth' => true, 'religion' => true, 'catholicOnly' => true,
                    'citizenship' => true, 'civilStatus' => ['single', 'widowed', 'annulled'],
                ])
                + FieldGroups::address("{$x}Residence")
                + FieldGroups::person("{$x}Father")
                + FieldGroups::person("{$x}Mother");
        }

        return $rules;
    }

    /** A burial is within 60 days of the death (mirrors BURIAL_WINDOW_DAYS in the parishioner app). */
    private const BURIAL_WINDOW_DAYS = 60;

    private static function withinBurialWindow(array $d): \Closure
    {
        return function (string $attribute, mixed $value, \Closure $fail) use ($d) {
            $death = $d['deceasedDateOfDeath'] ?? null;
            $valid = fn (mixed $v) => is_string($v) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $v) && strtotime($v) !== false;
            if (! $valid($death) || ! $valid($value)) {
                return; // the date_format rules report the malformed value
            }
            if ($value > date('Y-m-d', strtotime($death.' +'.self::BURIAL_WINDOW_DAYS.' days'))) {
                $fail('The burial date must be within '.self::BURIAL_WINDOW_DAYS.' days of the date of death.');
            }
        };
    }

    private static function funeral(array $d, string $today): array
    {
        return [
            // The burial is within 60 days of the death and cannot be before today, so a death older than 60 days has no valid burial date.
            'deceasedDateOfDeath' => ['required', 'date_format:Y-m-d', "before_or_equal:{$today}", 'after_or_equal:'.date('Y-m-d', strtotime($today.' -'.self::BURIAL_WINDOW_DAYS.' days'))],
            'burialCemetery' => ['required', 'string', 'max:255'],
            'burialDate' => ['required', 'date_format:Y-m-d', 'after_or_equal:deceasedDateOfDeath', "after_or_equal:{$today}", self::withinBurialWindow($d)],
            'massType' => ['required', 'in:church,house'],
        ]
            + FieldGroups::person('deceased', [
                'sex' => true, 'age' => true, 'religion' => true, 'civilStatus' => FieldGroups::CIVIL_STATUSES,
            ])
            + FieldGroups::address('deceasedResidence')
            + FieldGroups::address('houseMassAddress', ($d['massType'] ?? null) === 'house');
    }

    private static function anointing(array $d): array
    {
        return [
            'locationType' => ['required', 'in:home,hospital'],
            // A real name has letters and some length; "a" or "123" is not a hospital or a ward.
            'hospitalName' => ['required_if:locationType,hospital', 'nullable', 'string', 'min:3', 'max:255', 'regex:/\p{L}{2}/u'],
            'hospitalRoom' => ['required_if:locationType,hospital', 'nullable', 'string', 'min:1', 'max:60', 'regex:/[\p{L}\p{N}]/u'],
            'inDangerOfDeath' => ['required', 'boolean'],
        ]
            + FieldGroups::person('patient', ['sex' => true, 'age' => true])
            + FieldGroups::address('patientAddress', ($d['locationType'] ?? null) === 'home');
    }

    private static function houseBlessing(array $d): array
    {
        $type = $d['propertyType'] ?? null;

        return [
            'propertyType' => ['required', 'in:house,business,vehicle,other'],
            // A person or a business ("7-Eleven Balagtas", "R&J Trading"), so general text, not the person-name pattern.
            'propertyOwner' => ['required', 'string', 'max:120'],
            'vehiclePlate' => ['required_if:propertyType,vehicle', 'nullable', 'regex:/^[A-Za-z0-9 -]{3,10}$/'],
            'propertyDescription' => ['required_if:propertyType,other', 'nullable', 'string', 'max:255'],
            'occasion' => ['nullable', 'string', 'max:120'],
        ] + FieldGroups::address('propertyAddress', $type !== null && $type !== 'vehicle');
    }

    /** Rules that need several fields at once. */
    private static function crossField(string $sacrament, array $d, Validator $v): void
    {
        $sponsors = is_array($d['sponsors'] ?? null) ? array_values(array_filter($d['sponsors'], 'is_array')) : [];

        if ($sacrament === 'baptism' && isset($sponsors[0])) {
            if (($sponsors[0]['age'] ?? 0) < 16) {
                $v->errors()->add('sponsors.0.age', 'The principal godparent must be at least 16 years old.');
            }
        }

        if ($sacrament === 'confirmation' && isset($sponsors[0])) {
            $sponsorName = self::fullName($sponsors[0]['firstName'] ?? null, $sponsors[0]['lastName'] ?? null);
            foreach (['father', 'mother'] as $parent) {
                if ($sponsorName !== '' && $sponsorName === self::fullName($d["{$parent}FirstName"] ?? null, $d["{$parent}LastName"] ?? null)) {
                    $v->errors()->add('sponsors.0.lastName', 'A parent cannot be the Confirmation sponsor.');
                }
            }
        }

        if ($sacrament === 'wedding' && $sponsors !== []) {
            $roles = array_count_values(array_map(fn ($s) => self::str($s['role'] ?? null), $sponsors));
            if (count($sponsors) % 2 !== 0 || ($roles['ninong'] ?? 0) !== ($roles['ninang'] ?? 0)) {
                $v->errors()->add('sponsors', 'Principal sponsors must be in pairs (one Ninong and one Ninang each).');
            }
        }
    }

    private static function fullName(mixed $first, mixed $last): string
    {
        return mb_strtolower(trim(preg_replace('/\s+/', ' ', self::str($first).' '.self::str($last))));
    }

    /** Non-string input counts as empty; the base rules already reject it. */
    private static function str(mixed $v): string
    {
        return is_string($v) ? $v : '';
    }
}
