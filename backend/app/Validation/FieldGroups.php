<?php

namespace App\Validation;

use App\Support\ParishClock;
use Illuminate\Validation\Rule;

/** Laravel rules for the shared field groups (spec §1). Key names: plan Field Dictionary. */
final class FieldGroups
{
    public const RELIGIONS = [
        'Roman Catholic', 'Aglipayan', 'Iglesia ni Cristo', 'Protestant', 'Born Again Christian', 'Baptist', 'Methodist',
        'Seventh-day Adventist', "Jehovah's Witnesses", 'Members Church of God International', 'Church of Jesus Christ of Latter-day Saints',
        'Other Christian', 'Islam', 'Buddhism', 'Hinduism', 'Other', 'None',
    ];

    /** Baptism and wedding are for Catholics only. */
    public const CATHOLIC_ONLY = ['Roman Catholic'];

    /** Suffix choices (men only on the forms; N/A is simply left empty). */
    public const SUFFIXES = ['Jr.', 'Sr.', 'III'];

    public const CIVIL_STATUSES = ['single', 'married', 'widowed', 'annulled', 'separated'];

    /** Letters (any script), combining marks, spaces, periods, apostrophes, hyphens. */
    public const NAME = ['string', 'max:80', "regex:/^[\\pL\\pM .'\\-]+$/u"];

    public static function common(string $sacrament): array
    {
        return [
            'bookingFor' => $sacrament === 'funeral' ? ['required', 'in:other'] : ['required', 'in:self,other'],
            'relationship' => ['required_if:bookingFor,other', 'nullable', 'in:child,parent,spouse,sibling,relative,other'],
            // When the relationship is "someone else", the parishioner says in their own words who they are to them.
            'relationshipOther' => ['required_if:relationship,other', 'nullable', 'string', 'max:80'],
            'alternatePhone' => ['nullable', 'regex:/^09\d{9}$/'],
        ];
    }

    public static function person(string $p, array $o = []): array
    {
        $req = ($o['required'] ?? true) ? 'required' : 'nullable';

        $rules = [
            "{$p}FirstName" => [$req, ...self::NAME],
            "{$p}MiddleName" => ['nullable', ...self::NAME],
            "{$p}LastName" => [$req, ...self::NAME],
            "{$p}Suffix" => ['nullable', Rule::in(self::SUFFIXES)],
        ];

        if ($o['dob'] ?? false) {
            $latest = isset($o['minAgeYears'])
                ? ParishClock::today()->subYears($o['minAgeYears'])->toDateString()
                : ParishClock::todayString();
            $rules["{$p}DateOfBirth"] = [$req, 'date_format:Y-m-d', "before_or_equal:{$latest}"];
        }
        if ($o['placeOfBirth'] ?? false) {
            $rules += self::address("{$p}PlaceOfBirth", $req === 'required', withLine: false);
        }
        if ($o['sex'] ?? false) {
            $rules["{$p}Sex"] = [$req, 'in:male,female'];
        }
        if ($o['religion'] ?? false) {
            $rules["{$p}Religion"] = [$req, Rule::in(($o['catholicOnly'] ?? false) ? self::CATHOLIC_ONLY : self::RELIGIONS)];
        }
        if ($o['citizenship'] ?? false) {
            $rules["{$p}Citizenship"] = [$req, 'string', 'max:60'];
        }
        if (isset($o['civilStatus'])) {
            $rules["{$p}CivilStatus"] = [$req, Rule::in($o['civilStatus'])];
        }
        if ($o['age'] ?? false) {
            $rules["{$p}Age"] = [$req, 'integer', 'min:0', 'max:130'];
        }

        return $rules;
    }

    public static function address(string $k, bool $required = true, bool $withLine = true): array
    {
        $rules = [
            $k => [$required ? 'required' : 'nullable', 'string', 'max:255'],
            "{$k}RegionCode" => ['nullable', 'string', 'max:20'],
            "{$k}ProvinceCode" => ['nullable', 'string', 'max:20'],
            "{$k}CityCode" => ['nullable', 'string', 'max:20'],
            "{$k}BarangayCode" => ['nullable', 'string', 'max:20'],
        ];
        if ($withLine) {
            $rules["{$k}Line"] = ['nullable', 'string', 'max:255'];
        }

        return $rules;
    }

    public static function sponsors(int $min, int $max, int $minAge): array
    {
        return [
            'sponsors' => ['required', 'array', "min:{$min}", "max:{$max}"],
            'sponsors.*.role' => ['required', 'in:ninong,ninang'],
            'sponsors.*.firstName' => ['required', ...self::NAME],
            'sponsors.*.middleName' => ['nullable', ...self::NAME],
            'sponsors.*.lastName' => ['required', ...self::NAME],
            'sponsors.*.age' => ['required', 'integer', "min:{$minAge}", 'max:120'],
            'sponsors.*.religion' => ['required', Rule::in(self::RELIGIONS)],
            'sponsors.*.residence' => ['required', 'string', 'max:255'],
            'sponsors.*.residenceLine' => ['nullable', 'string', 'max:255'],
            'sponsors.*.residenceRegionCode' => ['nullable', 'string', 'max:20'],
            'sponsors.*.residenceProvinceCode' => ['nullable', 'string', 'max:20'],
            'sponsors.*.residenceCityCode' => ['nullable', 'string', 'max:20'],
            'sponsors.*.residenceBarangayCode' => ['nullable', 'string', 'max:20'],
        ];
    }
}
