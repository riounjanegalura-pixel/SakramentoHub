<?php

namespace App\Services\Register;

use App\Models\ParishSetting;
use App\Models\RegisterEntry;
use App\Support\ParishClock;
use BaconQrCode\Renderer\Image\SvgImageBackEnd;
use BaconQrCode\Renderer\ImageRenderer;
use BaconQrCode\Renderer\RendererStyle\RendererStyle;
use BaconQrCode\Writer;

/** Renders a register entry's certificate from its frozen snapshot; nothing is stored. */
final class CertificateRenderer
{
    public function html(RegisterEntry $entry, ?string $purpose = null): string
    {
        $snapshot = (array) $entry->snapshot;
        $verifyUrl = $this->verifyUrl($entry);
        $revoked = $entry->status === 'revoked';
        $paper = collect([
            $entry->book_no ? "Book {$entry->book_no}" : null,
            $entry->page_no ? "Page {$entry->page_no}" : null,
            $entry->line_no ? "No. {$entry->line_no}" : null,
        ])->filter()->implode(', ');
        $purpose = $purpose !== null && trim($purpose) !== '' ? trim($purpose) : null;
        $snapshot['details'] = $this->detailsWithCeremony($entry->sacrament, $snapshot);

        return view('certificates.certificate', [
            'snapshot' => $snapshot,
            'number' => $entry->register_number,
            'revoked' => $revoked,
            'paperReference' => $paper !== '' ? $paper : null,
            'issuedOn' => ParishClock::today()->format('F j, Y'),
            'purpose' => $purpose,
            'qr' => $verifyUrl !== null && ! $revoked ? $this->qrSvg($verifyUrl) : null,
            'code' => ParishRegister::formatCode($entry->verify_code),
            'verifyHost' => $verifyUrl !== null ? $this->verifyHost() : null,
            // A revoked certificate keeps the printed name but never carries the signature image.
            'signature' => self::signatureBlock(withImage: ! $revoked),
        ])->render();
    }

    /**
     * Who signs the paper being printed now: today's parish priest, with the title and the optional signature image
     * from the parish settings. The minister of the sacrament stays in the frozen snapshot; the signer does not.
     *
     * @return array{name:string,title:string,image:?string}
     */
    public static function signatureBlock(bool $withImage): array
    {
        return [
            'name' => ParishSetting::priestName(),
            'title' => ParishSetting::priestTitle(),
            'image' => $withImage ? ParishSetting::priestSignature() : null,
        ];
    }

    /**
     * The detail rows, plus the ceremony date and the minister when nothing on the certificate shows them.
     * An entry made from a booking already carries both as rows; an entry copied from a paper book holds
     * them only as its own fields, and its certificate would otherwise print neither. Nothing is stored:
     * the rows are added at print time from the snapshot, so a correction is followed automatically.
     *
     * @return list<array{label:string,value:string}>
     */
    private function detailsWithCeremony(string $sacrament, array $snapshot): array
    {
        $details = array_values((array) ($snapshot['details'] ?? []));
        $printed = ($snapshot['statement'] ?? '').' '.implode(' ', array_map(fn ($row) => (string) ($row['value'] ?? ''), $details));
        [$dateLabel, $ministerLabel] = CertificateContent::ceremonyLabels($sacrament);

        $date = (string) ($snapshot['ceremonyDate'] ?? '');
        $long = $date !== '' && strtotime($date) !== false ? date('F j, Y', strtotime($date)) : null;
        if ($long !== null && ! str_contains($printed, $long)) {
            $details[] = ['label' => $dateLabel, 'value' => $long];
        }
        $minister = trim((string) ($snapshot['minister'] ?? ''));
        if ($minister !== '' && ! str_contains($printed, $minister)) {
            $details[] = ['label' => $ministerLabel, 'value' => $minister];
        }

        return $details;
    }

    public function qrSvg(string $text, int $size = 160): string
    {
        $writer = new Writer(new ImageRenderer(new RendererStyle($size), new SvgImageBackEnd));

        return trim(preg_replace('/^<\?xml[^>]*\?>\s*/', '', $writer->writeString($text)));
    }

    public function verifyUrl(RegisterEntry $entry): ?string
    {
        if ($entry->verify_code === null) {
            return null;
        }

        return $this->base().'/verify/'.$entry->register_number.'/'.ParishRegister::formatCode($entry->verify_code);
    }

    private function base(): string
    {
        return rtrim((string) config('app.parishioner_url'), '/');
    }

    private function verifyHost(): string
    {
        return (parse_url($this->base(), PHP_URL_HOST) ?: $this->base()).'/verify';
    }
}
