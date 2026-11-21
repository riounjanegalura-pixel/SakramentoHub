<?php

namespace App\Support;

use InvalidArgumentException;

/**
 * The priest's signature image, uploaded from the settings screen as a data URL and printed on certificates.
 *
 * Only a whole PNG or JPEG of at most 200 KB is kept. The type the client declares is not trusted: the bytes are
 * decoded and read back. A PNG is checked chunk by chunk (each checksum, IHDR first, IEND last, nothing after it) and
 * its pixel data is inflated to exactly the size the header promises. A JPEG is walked marker by marker to a frame
 * header and a scan and must end with the end-of-image marker. GD is not available on the server, so the JPEG's
 * compressed picture data itself is not decoded. What is stored is re-encoded from the checked bytes, under the type
 * they really have.
 */
final class SignatureImage
{
    public const MAX_BYTES = 200 * 1024;

    /** A signature needs nothing near this; it keeps a small file from inflating into a huge picture. */
    public const MAX_SIDE = 2000;

    public const TYPE_MESSAGE = 'Upload the signature as a PNG or JPEG image.';

    public const SIZE_MESSAGE = 'The signature image must be 200 KB or smaller.';

    public const UNREADABLE_MESSAGE = 'The signature image could not be read. Upload a PNG or JPEG file.';

    public const DIMENSIONS_MESSAGE = 'The signature image must be at most 2000 × 2000 pixels.';

    /** The longest data URL worth decoding: 200 KB in base64 (273,068 characters) plus room for the prefix. */
    public const MAX_DATA_URL_LENGTH = 273_100;

    private const CLEAN = '#^data:image/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$#';

    private const MIME = [IMAGETYPE_PNG => 'image/png', IMAGETYPE_JPEG => 'image/jpeg'];

    /**
     * The canonical data URL for an uploaded signature.
     *
     * @throws InvalidArgumentException with the message to show when it is not a whole PNG or JPEG within the limits
     */
    public static function normalize(string $dataUrl): string
    {
        if (! preg_match('#^data:image/(?:png|jpeg|jpg);base64,([A-Za-z0-9+/]+={0,2})$#', $dataUrl, $m)) {
            throw new InvalidArgumentException(self::TYPE_MESSAGE);
        }
        $bytes = base64_decode($m[1], true);
        if ($bytes === false || $bytes === '') {
            throw new InvalidArgumentException(self::UNREADABLE_MESSAGE);
        }
        if (strlen($bytes) > self::MAX_BYTES) {
            throw new InvalidArgumentException(self::SIZE_MESSAGE);
        }

        $info = @getimagesizefromstring($bytes);
        $type = is_array($info) ? $info[2] : null;
        if (! isset(self::MIME[$type])) {
            throw new InvalidArgumentException(self::UNREADABLE_MESSAGE);
        }
        [$width, $height] = $info;
        if ($width < 1 || $height < 1 || $width > self::MAX_SIDE || $height > self::MAX_SIDE) {
            throw new InvalidArgumentException(self::DIMENSIONS_MESSAGE);
        }
        $whole = $type === IMAGETYPE_PNG ? self::pngIsWhole($bytes) : self::jpegIsWhole($bytes);
        if (! $whole) {
            throw new InvalidArgumentException(self::UNREADABLE_MESSAGE);
        }

        return 'data:'.self::MIME[$type].';base64,'.base64_encode($bytes);
    }

    /** True for a value shaped like what normalize() returns; used again at print time. */
    public static function isClean(string $dataUrl): bool
    {
        return strlen($dataUrl) <= self::MAX_DATA_URL_LENGTH && preg_match(self::CLEAN, $dataUrl) === 1;
    }

    /** A short stand-in for the audit log, which never holds the image itself. */
    public static function describe(?string $dataUrl): ?string
    {
        if ($dataUrl === null) {
            return null;
        }
        $bytes = (string) base64_decode((string) substr($dataUrl, (int) strpos($dataUrl, ',') + 1));
        $kind = str_starts_with($dataUrl, 'data:image/png') ? 'PNG' : 'JPEG';

        return "{$kind} image, ".strlen($bytes).' bytes, sha256 '.substr(hash('sha256', $bytes), 0, 12);
    }

    private static function pngIsWhole(string $b): bool
    {
        if (! str_starts_with($b, "\x89PNG\r\n\x1a\n")) {
            return false;
        }
        $len = strlen($b);
        $pos = 8;
        $types = [];
        $header = $idat = '';
        while ($pos + 12 <= $len) {
            $size = unpack('N', substr($b, $pos, 4))[1];
            if ($pos + 12 + $size > $len) {
                return false;
            }
            $type = substr($b, $pos + 4, 4);
            $data = substr($b, $pos + 8, $size);
            if (unpack('N', substr($b, $pos + 8 + $size, 4))[1] !== crc32($type.$data)) {
                return false;
            }
            $types[] = $type;
            if ($type === 'IHDR') {
                $header = $data;
            } elseif ($type === 'IDAT') {
                $idat .= $data;
            }
            $pos += 12 + $size;
            if ($type === 'IEND') {
                break;
            }
        }
        if ($pos !== $len || ($types[0] ?? null) !== 'IHDR' || end($types) !== 'IEND' || strlen($header) !== 13 || $idat === '') {
            return false;
        }

        $expected = self::pngDataSize($header);

        return $expected !== null && self::inflatedSize($idat, $expected) === $expected;
    }

    /** The number of bytes the image data inflates to, from the IHDR fields; null for a header no decoder accepts. */
    private static function pngDataSize(string $header): ?int
    {
        ['w' => $w, 'h' => $h, 'depth' => $depth, 'colour' => $colour, 'interlace' => $interlace] = unpack('Nw/Nh/Cdepth/Ccolour/Ccompression/Cfilter/Cinterlace', $header);
        $channels = [0 => 1, 2 => 3, 3 => 1, 4 => 2, 6 => 4][$colour] ?? null;
        if ($channels === null || ! in_array($depth, [1, 2, 4, 8, 16], true) || $interlace > 1) {
            return null;
        }
        $bits = $channels * $depth;
        $rows = fn (int $width, int $height) => $width > 0 && $height > 0 ? $height * (1 + intdiv($width * $bits + 7, 8)) : 0;
        if ($interlace === 0) {
            return $rows($w, $h);
        }
        // Adam7: seven reduced images, each with its own filter byte per row.
        $total = 0;
        foreach ([[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]] as [$x0, $y0, $dx, $dy]) {
            $total += $rows(intdiv($w - $x0 + $dx - 1, $dx), intdiv($h - $y0 + $dy - 1, $dy));
        }

        return $total;
    }

    /** Inflates in small pieces and stops as soon as the output passes the limit, so nothing large is ever held. */
    private static function inflatedSize(string $zlib, int $limit): ?int
    {
        $context = @inflate_init(ZLIB_ENCODING_DEFLATE);
        if ($context === false) {
            return null;
        }
        $out = 0;
        foreach (str_split($zlib, 4096) as $piece) {
            $chunk = @inflate_add($context, $piece, ZLIB_SYNC_FLUSH);
            if ($chunk === false) {
                return null;
            }
            $out += strlen($chunk);
            if ($out > $limit) {
                return null;
            }
        }

        return inflate_get_status($context) === ZLIB_STREAM_END ? $out : null;
    }

    private static function jpegIsWhole(string $b): bool
    {
        $len = strlen($b);
        if ($len < 4 || ! str_starts_with($b, "\xFF\xD8") || ! str_ends_with($b, "\xFF\xD9")) {
            return false;
        }
        $pos = 2;
        $frame = false;
        while ($pos + 4 <= $len) {
            if ($b[$pos] !== "\xFF") {
                return false;
            }
            $marker = ord($b[$pos + 1]);
            if ($marker === 0xFF) { // fill byte
                $pos++;

                continue;
            }
            if ($marker === 0xD9) { // ended before any picture data
                return false;
            }
            $size = unpack('n', substr($b, $pos + 2, 2))[1];
            if ($size < 2 || $pos + 2 + $size > $len) {
                return false;
            }
            // SOF0-SOF15, except DHT (C4), JPG (C8) and DAC (CC), which share the range.
            if ($marker >= 0xC0 && $marker <= 0xCF && ! in_array($marker, [0xC4, 0xC8, 0xCC], true)) {
                $frame = true;
            }
            if ($marker === 0xDA) { // start of scan: picture data follows, then the end marker
                return $frame && $pos + 2 + $size < $len - 2;
            }
            $pos += 2 + $size;
        }

        return false;
    }
}
