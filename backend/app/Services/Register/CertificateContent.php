<?php

namespace App\Services\Register;

use App\Models\Booking;
use App\Models\ParishSetting;
use Illuminate\Support\Carbon;

/** Builds the words and facts a certificate shows; the register entry freezes the result as its snapshot. */
final class CertificateContent
{
    /** sacrament => [certificate subject, statement with {date} where the ceremony date goes]. */
    private const WORDING = [
        'baptism' => ['Baptism', 'was baptized according to the Rite of the Roman Catholic Church{date}.'],
        'confirmation' => ['Confirmation', 'received the Sacrament of Confirmation{date}.'],
        'wedding' => ['Marriage', 'were united in Holy Matrimony{date}.'],
        'funeral' => ['Funeral Mass', 'was commended to God in a Funeral Mass celebrated{date}.'],
        'anointing' => ['Anointing of the Sick', 'received the Sacrament of the Anointing of the Sick{date}.'],
        'house-blessing' => ['Blessing', 'is the owner of the property described below, which was blessed{date}.'],
    ];

    /**
     * @return array{subjectName:string,ceremonyDate:string,minister:string,parishName:string,parishAddress:string,title:string,statement:string,details:list<array{label:string,value:string}>}
     */
    public static function snapshotFor(Booking $booking, string $ceremonyDate): array
    {
        $long = Carbon::parse($ceremonyDate)->format('F j, Y');
        $details = [];
        foreach (self::details($booking, $long) as $label => $value) {
            $details[] = ['label' => $label, 'value' => $value];
        }

        return [
            'subjectName' => $booking->subjectName(),
            'ceremonyDate' => $ceremonyDate,
            'minister' => ParishSetting::priestName(),
            'parishName' => ParishSetting::parishName(),
            'parishAddress' => ParishSetting::parishAddress(),
            'title' => self::titleFor($booking->sacrament),
            'statement' => self::statementFor($booking->sacrament, $long),
            'details' => $details,
        ];
    }

    public static function titleFor(string $sacrament): string
    {
        return 'Certificate of '.(self::WORDING[$sacrament][0] ?? 'Service');
    }

    /**
     * The labels of the ceremony-date row and the minister row, as `details()` writes them for a booking.
     *
     * @return array{0:string,1:string}
     */
    public static function ceremonyLabels(string $sacrament): array
    {
        return match ($sacrament) {
            'baptism' => ['Date of Baptism', 'Minister'],
            'confirmation' => ['Date of Confirmation', 'Minister'],
            'wedding' => ['Date of Marriage', 'Officiating Minister'],
            'funeral' => ['Funeral Mass', 'Celebrant'],
            'anointing' => ['Date Administered', 'Minister'],
            'house-blessing' => ['Date of Blessing', 'Minister'],
            default => ['Date', 'Minister'],
        };
    }

    /** With a long-form date the statement ends "... on October 10, 2026."; without one (a transcribed entry) it carries no date. */
    public static function statementFor(string $sacrament, ?string $longDate = null): string
    {
        $template = self::WORDING[$sacrament][1] ?? 'received the service recorded below{date}.';

        return str_replace('{date}', $longDate === null ? '' : " on {$longDate}", $template);
    }

    /** Ordered label => value, blanks dropped. Keys follow the plan's Field Dictionary. */
    private static function details(Booking $booking, string $ceremony): array
    {
        $d = (array) ($booking->form_data ?? []);
        $get = fn (string $k) => isset($d[$k]) && $d[$k] !== '' ? (string) $d[$k] : null;
        // A date typed in the form (stored as 2026-07-14) is written out like the ceremony date; anything else stays as typed.
        $date = function (string $k) use ($get) {
            $v = $get($k);

            return $v !== null && preg_match('/^\d{4}-\d{2}-\d{2}$/', $v) && strtotime($v) !== false ? date('F j, Y', strtotime($v)) : $v;
        };
        $name = fn (string $p) => trim(implode(' ', array_filter([$get("{$p}FirstName"), $get("{$p}MiddleName"), $get("{$p}LastName"), $get("{$p}Suffix")]))) ?: null;
        $sponsors = fn () => collect($d['sponsors'] ?? [])->map(fn ($s) => trim(($s['firstName'] ?? '').' '.($s['lastName'] ?? '')))->filter()->implode(', ') ?: null;
        $minister = ParishSetting::priestName();

        $details = match ($booking->sacrament) {
            'baptism' => [
                'Date of Birth' => $date('childDateOfBirth'),
                'Place of Birth' => $get('childPlaceOfBirth'),
                'Father' => ($d['fatherOmitted'] ?? false) ? null : $name('father'),
                'Mother' => ($d['motherOmitted'] ?? false) ? null : $name('mother'),
                'Godparents' => $sponsors(),
                'Date of Baptism' => $ceremony,
                'Minister' => $minister,
            ],
            'confirmation' => [
                'Date of Birth' => $date('confirmandDateOfBirth'),
                'Place of Birth' => $get('confirmandPlaceOfBirth'),
                'Father' => $name('father'),
                'Mother' => $name('mother'),
                'Sponsor' => $sponsors(),
                'Date of Confirmation' => $ceremony,
                'Minister' => $minister,
            ],
            'wedding' => [
                'Groom' => $name('groom'),
                'Bride' => $name('bride'),
                'Date of Marriage' => $ceremony,
                'Place of Marriage' => ($d['venueType'] ?? 'parish') === 'other' ? $get('venueName') : ParishSetting::parishName(),
                'Principal Sponsors' => $sponsors(),
                'Officiating Minister' => $minister,
            ],
            'funeral' => [
                'Date of Death' => $date('deceasedDateOfDeath'),
                'Funeral Mass' => $ceremony.(($d['massType'] ?? null) === 'house' ? ' (House Mass)' : ' (Church Mass)'),
                'Place of Burial' => $get('burialCemetery'),
                'Celebrant' => $minister,
            ],
            'anointing' => [
                'Date Administered' => $ceremony,
                'Place' => ($d['locationType'] ?? null) === 'hospital'
                    ? trim(($get('hospitalName') ?? '').' '.($get('hospitalRoom') ?? ''))
                    : $get('patientAddress'),
                'Minister' => $minister,
            ],
            'house-blessing' => [
                'Property' => ($d['propertyType'] ?? null) === 'other' && $get('propertyDescription')
                    ? $get('propertyDescription')
                    : ucfirst((string) ($d['propertyType'] ?? '')),
                'Address / Plate No.' => $get('propertyAddress') ?? $get('vehiclePlate'),
                'Date of Blessing' => $ceremony,
                'Minister' => $minister,
            ],
            // A service id the register does not know still gets a certificate rather than an error.
            default => [
                'Date' => $ceremony,
                'Minister' => $minister,
            ],
        };

        return array_filter($details, fn ($v) => $v !== null && $v !== '');
    }
}
