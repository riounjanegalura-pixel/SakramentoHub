<?php

namespace App\Validation;

/**
 * The one list of documents each service asks for. Submit validation
 * (SacramentRules) and the staff review checklist (Booking::documentChecklist)
 * both read it, so they cannot disagree about which files a booking needs.
 */
final class SacramentDocuments
{
    /** Document key => wallet kind; every key not listed is "other". */
    public const WALLET_KINDS = [
        'birthCertificate' => 'birth_certificate',
        'baptismalCertificate' => 'baptismal_certificate',
        'groomBaptismalCertificate' => 'baptismal_certificate',
        'brideBaptismalCertificate' => 'baptismal_certificate',
        'groomConfirmationCertificate' => 'confirmation_certificate',
        'brideConfirmationCertificate' => 'confirmation_certificate',
        'marriageContract' => 'marriage_contract',
        'groomCenomar' => 'cenomar',
        'brideCenomar' => 'cenomar',
        'deathCertificate' => 'death_certificate',
        'groomSpouseDeathCertificate' => 'death_certificate',
        'brideSpouseDeathCertificate' => 'death_certificate',
    ];

    public static function walletKind(string $key): string
    {
        return self::WALLET_KINDS[$key] ?? 'other';
    }

    /**
     * Every document a service can ask for, whatever the form says: what the service page shows before booking.
     * `for()` decides which of these apply to a given form, and is derived from this list so the two cannot drift.
     *
     * @return list<array{key: string, label: string, walletKind: string, requirement: string, condition: ?string}>
     */
    public static function catalogue(string $sacrament): array
    {
        $doc = fn (string $key, string $label, string $requirement, ?string $condition = null) => [
            'key' => $key, 'label' => $label, 'walletKind' => self::walletKind($key),
            'requirement' => $requirement, 'condition' => $condition,
        ];

        return match ($sacrament) {
            'baptism' => [
                $doc('birthCertificate', 'PSA birth certificate', 'optional'),
                $doc('marriageContract', "Parents' marriage contract", 'optional'),
            ],
            'confirmation' => [
                $doc('baptismalCertificate', 'Baptismal certificate', 'required'),
            ],
            'wedding' => array_merge(
                self::weddingParty('groom'),
                self::weddingParty('bride'),
                [
                    $doc('marriageLicense', 'Marriage license or Art. 34 affidavit', 'optional'),
                    $doc('preCanaCertificate', 'Pre-Cana seminar certificate', 'optional'),
                    $doc('bannsCertificate', 'Banns certificate', 'optional'),
                    $doc('confessionCertificate', 'Confession certificate', 'optional'),
                ],
            ),
            'funeral' => [
                $doc('deathCertificate', 'Death certificate', 'required'),
            ],
            default => [],
        };
    }

    /** @return list<array{key: string, label: string, required: bool}> */
    public static function for(string $sacrament, array $d): array
    {
        return array_map(fn (array $doc) => [
            'key' => $doc['key'],
            'label' => $doc['label'],
            'required' => match ($doc['requirement']) {
                'required' => true,
                'optional' => false,
                default => self::conditionHolds($doc['key'], $d),
            },
        ], self::catalogue($sacrament));
    }

    /** Whether a conditional document's condition is met by this form. */
    private static function conditionHolds(string $key, array $d): bool
    {
        foreach (['groom', 'bride'] as $x) {
            $status = $d["{$x}CivilStatus"] ?? null;
            if ($key === "{$x}SpouseDeathCertificate") {
                return $status === 'widowed';
            }
            if ($key === "{$x}NullityDecree") {
                return $status === 'annulled';
            }
        }

        return false;
    }

    private static function weddingParty(string $x): array
    {
        $who = ucfirst($x); // Groom / Bride
        $doc = fn (string $key, string $label, string $requirement, ?string $condition = null) => [
            'key' => $key, 'label' => $label, 'walletKind' => self::walletKind($key),
            'requirement' => $requirement, 'condition' => $condition,
        ];

        return [
            $doc("{$x}BaptismalCertificate", "{$who}'s baptismal certificate (for marriage purposes)", 'required'),
            $doc("{$x}ConfirmationCertificate", "{$who}'s confirmation certificate", 'required'),
            $doc("{$x}Cenomar", "{$who}'s CENOMAR", 'required'),
            $doc("{$x}SpouseDeathCertificate", "{$who}'s late spouse's death certificate", 'conditional', "Required if the {$x} is widowed"),
            $doc("{$x}NullityDecree", "{$who}'s decree of nullity", 'conditional', "Required if the {$x}'s previous marriage was annulled"),
            $doc("{$x}Photo", "{$who}'s 2x2 photo", 'required'),
        ];
    }
}
