<?php

namespace App\Services\Register;

use App\Enums\BookingStatus;
use App\Models\Booking;
use App\Models\ParishSetting;
use App\Support\ParishClock;
use Illuminate\Support\Carbon;

/**
 * The parish form for a booking, filled in from the answers the parishioner gave: the Registration for Baptism and
 * the Certificate of Marriage. It exists as soon as the booking is submitted, so the parish never has to hand out a
 * blank form or a copy of someone else's. It is a pre-filled copy, not the register entry: the signed parish register
 * stays the official record, and the page says so. Sacraments the parish has not supplied a form for return null.
 */
final class PrefilledCertificate
{
    /** Booking statuses that have answers worth printing: everything after the draft that was not turned away. */
    private const PRINTABLE = [BookingStatus::Submitted, BookingStatus::Returned, BookingStatus::Approved, BookingStatus::Completed];

    public static function supports(Booking $booking): bool
    {
        return in_array($booking->sacrament, ['baptism', 'wedding'], true) && in_array($booking->status, self::PRINTABLE, true);
    }

    /**
     * $forOffice is true when the parish office prints it. Only then does the baptism form carry the priest's
     * signature image: the parishioner's own copy is printed before the parish has reviewed anything.
     */
    public function html(Booking $booking, bool $forOffice = false): ?string
    {
        if (! self::supports($booking)) {
            return null;
        }

        return match ($booking->sacrament) {
            'baptism' => view('certificates.baptism-registration', $this->baptism($booking) + [
                'signature' => CertificateRenderer::signatureBlock(withImage: $forOffice),
            ])->render(),
            'wedding' => view('certificates.marriage-certificate', $this->wedding($booking))->render(),
        };
    }

    /** @return array<string,mixed> */
    private function baptism(Booking $booking): array
    {
        $d = (array) ($booking->form_data ?? []);
        $get = fn (string $k) => isset($d[$k]) && $d[$k] !== '' ? (string) $d[$k] : null;
        $date = $booking->appointment_date ? Carbon::parse($booking->appointment_date) : null;
        $birth = $get('childDateOfBirth');
        $sponsors = collect($d['sponsors'] ?? []);
        $principal = fn (string $role) => $sponsors->firstWhere('role', $role);
        $others = $sponsors->reject(fn ($s) => $s === $principal($s['role'] ?? ''))->values();
        $residence = trim(($get('parentsResidenceLine') ?? '').' '.($get('parentsResidence') ?? ''));
        $marriage = $get('parentsMarriage');
        $relationship = $get('relationship');

        return $this->common($booking) + [
            'title' => 'Registration for Baptism',
            'subtitle' => 'Palistahan ng Binyag',
            'child' => [
                'first' => $get('childFirstName'), 'middle' => $get('childMiddleName'), 'last' => $get('childLastName'), 'suffix' => $get('childSuffix'),
                'birth' => $birth ? Carbon::parse($birth)->format('F j, Y') : null,
                'age' => $birth ? $this->age($birth, $date) : null,
                'sex' => match ($get('childSex')) { 'male' => 'Male', 'female' => 'Female', default => null },
                'place' => $get('childPlaceOfBirth'),
            ],
            'father' => ($d['fatherOmitted'] ?? false) ? null : [
                'first' => $get('fatherFirstName'), 'middle' => $get('fatherMiddleName'), 'last' => $get('fatherLastName'), 'suffix' => $get('fatherSuffix'),
                'place' => $get('fatherPlaceOfBirth'), 'address' => $residence ?: null,
            ],
            'fatherOmitted' => (bool) ($d['fatherOmitted'] ?? false) ? ($get('fatherOmittedReason') ?? 'Not included') : null,
            'mother' => ($d['motherOmitted'] ?? false) ? null : [
                'first' => $get('motherFirstName'), 'middle' => $get('motherMiddleName'), 'last' => $get('motherLastName'),
                'place' => $get('motherPlaceOfBirth'), 'address' => $residence ?: null,
            ],
            'motherOmitted' => (bool) ($d['motherOmitted'] ?? false) ? ($get('motherOmittedReason') ?? 'Not included') : null,
            'marriageKind' => $marriage,
            'marriageDate' => ($m = $get('parentsMarriageDate')) ? Carbon::parse($m)->format('F j, Y') : null,
            'marriagePlace' => $get('parentsMarriagePlace'),
            'minister' => ParishSetting::priestName(),
            'baptismDate' => $date?->format('F j, Y'),
            'baptismTime' => $booking->appointment_start ? Carbon::parse($booking->appointment_start)->format('g:i A') : null,
            'principalNinong' => $this->sponsor($principal('ninong')),
            'principalNinang' => $this->sponsor($principal('ninang')),
            'otherSponsors' => $others->map(fn ($s) => $this->sponsor($s))->all(),
            'accomplishedBy' => $booking->ownerName(),
            'relation' => $relationship ? ucfirst(str_replace('_', ' ', $relationship)) : null,
            'contact' => $booking->user?->phone ?: null,
            'accomplishedOn' => $booking->created_at?->copy()->setTimezone(ParishClock::now()->getTimezone())->format('F j, Y'),
            'register' => $this->paperReference($booking),
        ];
    }

    /** @return array<string,mixed> */
    private function wedding(Booking $booking): array
    {
        $d = (array) ($booking->form_data ?? []);
        $get = fn (string $k) => isset($d[$k]) && $d[$k] !== '' ? (string) $d[$k] : null;
        $date = $booking->appointment_date ? Carbon::parse($booking->appointment_date) : null;
        $person = function (string $p) use ($get, $date) {
            $dob = $get("{$p}DateOfBirth");

            return [
                'first' => $get("{$p}FirstName"), 'middle' => $get("{$p}MiddleName"), 'last' => $get("{$p}LastName"), 'suffix' => $get("{$p}Suffix"),
                'birth' => $dob ? Carbon::parse($dob)->format('j F Y') : null,
                'age' => $dob ? $this->age($dob, $date) : null,
                'place' => $get("{$p}PlaceOfBirth"),
                'sex' => $p === 'groom' ? 'Male' : 'Female',
                'citizenship' => $get("{$p}Citizenship"),
                'residence' => $get("{$p}Residence"),
                'religion' => $get("{$p}Religion"),
                'status' => ($s = $get("{$p}CivilStatus")) ? ucfirst($s) : null,
                'father' => [$get("{$p}FatherFirstName"), $get("{$p}FatherMiddleName"), $get("{$p}FatherLastName")],
                'fatherCitizenship' => $get("{$p}FatherCitizenship"),
                'mother' => [$get("{$p}MotherFirstName"), $get("{$p}MotherMiddleName"), $get("{$p}MotherLastName")],
                'motherCitizenship' => $get("{$p}MotherCitizenship"),
            ];
        };
        $witnesses = collect($d['sponsors'] ?? [])->map(fn ($s) => trim(($s['firstName'] ?? '').' '.($s['lastName'] ?? '')))->filter()->values()->all();

        return $this->common($booking) + [
            'title' => 'Certificate of Marriage',
            'groom' => $person('groom'),
            'bride' => $person('bride'),
            'place' => ($d['venueType'] ?? 'parish') === 'other' ? trim(($get('venueName') ?? '').', '.($get('venueAddress') ?? ''), ', ') : ParishSetting::parishName().', '.ParishSetting::parishAddress(),
            'marriageDate' => $date?->format('j F Y'),
            'marriageTime' => $booking->appointment_start ? Carbon::parse($booking->appointment_start)->format('g:i A') : null,
            'minister' => ParishSetting::priestName(),
            'witnesses' => $witnesses,
            'register' => $this->paperReference($booking),
        ];
    }

    /** @return array<string,mixed> */
    private function common(Booking $booking): array
    {
        return [
            'parishName' => ParishSetting::parishName(),
            'parishAddress' => ParishSetting::parishAddress(),
            'reference' => $booking->reference_number,
            'preparedOn' => ParishClock::today()->format('F j, Y'),
            'official' => $booking->registerEntry !== null,
            'crest' => $this->crest(),
        ];
    }

    private function sponsor(?array $s): ?array
    {
        if (! $s) {
            return null;
        }

        return ['name' => trim(($s['firstName'] ?? '').' '.($s['lastName'] ?? '')), 'age' => $s['age'] ?? null, 'place' => $s['residence'] ?? null, 'religion' => $s['religion'] ?? null];
    }

    private function age(string $born, ?Carbon $on): ?int
    {
        $birth = Carbon::parse($born);
        $at = $on ?? ParishClock::today();

        return $at->greaterThanOrEqualTo($birth) ? (int) $birth->diffInYears($at) : null;
    }

    /** Book, page and line only once the parish has written the entry into the register; blank before that. */
    private function paperReference(Booking $booking): array
    {
        $e = $booking->registerEntry;

        return ['book' => $e?->book_no, 'page' => $e?->page_no, 'line' => $e?->line_no, 'number' => $e?->register_number];
    }

    private function crest(): ?string
    {
        $path = resource_path('art/crest-sm.png');

        return is_file($path) ? 'data:image/png;base64,'.base64_encode((string) file_get_contents($path)) : null;
    }
}
