<?php

namespace App\Support;

use App\Models\Booking;
use App\Models\BookingDocumentReview;
use App\Models\CertificateRequest;
use App\Models\WalletDocument;
use Illuminate\Support\Facades\Storage;

/** The one place an uploaded file is removed from disk, and only when nothing still points at it. */
final class StoredDocuments
{
    /**
     * Deletes the file at a `/documents/{userId}/{filename}` address unless a booking, a document review, a
     * wallet row or a certificate request still uses it. Anything of another shape (or with `..`) is refused and left alone.
     *
     * @return bool true only when a file was deleted
     */
    public static function deleteIfUnreferenced(string $fileUrl): bool
    {
        if (str_contains($fileUrl, '..')
            || ! preg_match('#^/documents/[0-9a-fA-F-]{36}/[A-Za-z0-9_-][A-Za-z0-9._-]*$#', $fileUrl)) {
            return false;
        }

        $path = ltrim($fileUrl, '/');
        $disk = Storage::disk('local');
        if (! $disk->fileExists($path) || self::isReferenced($fileUrl)) {
            return false;
        }

        return $disk->delete($path);
    }

    public static function isReferenced(string $fileUrl): bool
    {
        if (WalletDocument::where('file_url', $fileUrl)->exists() || BookingDocumentReview::where('file_url', $fileUrl)->exists()) {
            return true;
        }
        if (CertificateRequest::where('id_url', $fileUrl)->orWhere('letter_url', $fileUrl)->exists()) {
            return true;
        }

        // form_data is JSON, and how it escapes "/" differs between SQLite and MySQL, so narrow by the file name
        // alone (an address ends in a unique stored name) and then compare exact values in PHP.
        $like = str_replace(['!', '%', '_'], ['!!', '!%', '!_'], basename($fileUrl));

        return Booking::query()->whereRaw("form_data LIKE ? ESCAPE '!'", ["%{$like}%"])->get(['id', 'form_data'])
            ->contains(function (Booking $booking) use ($fileUrl) {
                $found = false;
                $data = (array) $booking->form_data;
                array_walk_recursive($data, function ($value) use ($fileUrl, &$found) {
                    $found = $found || $value === $fileUrl;
                });

                return $found;
            });
    }
}
