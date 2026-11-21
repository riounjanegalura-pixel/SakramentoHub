<?php

namespace App\Services\PayMongo;

/**
 * Verifies the `Paymongo-Signature` header, per
 * https://developers.paymongo.com/docs/securing-webhook:
 *
 *   Paymongo-Signature: t=<unix timestamp>,te=<test-mode sig>,li=<live-mode sig>
 *
 * The signature is HMAC-SHA256( "<t>.<raw request body>", webhook secret ),
 * hex-encoded, compared against `te` for test-mode events or `li` for live
 * ones. The raw body must be used byte-for-byte — re-encoding the decoded
 * JSON would change it and break the comparison.
 */
class WebhookSignature
{
    public static function verify(
        ?string $header,
        string $rawBody,
        string $secret,
        bool $live,
        int $toleranceSeconds,
        ?int $now = null,
    ): bool {
        if (! $header || $secret === '') {
            return false;
        }

        $parts = [];
        foreach (explode(',', $header) as $pair) {
            [$key, $value] = array_pad(explode('=', trim($pair), 2), 2, '');
            $parts[$key] = $value;
        }

        $timestamp = $parts['t'] ?? '';
        $provided = $parts[$live ? 'li' : 'te'] ?? '';

        if (! ctype_digit($timestamp) || $provided === '') {
            return false;
        }

        if (abs(($now ?? time()) - (int) $timestamp) > $toleranceSeconds) {
            return false;
        }

        $expected = hash_hmac('sha256', $timestamp.'.'.$rawBody, $secret);

        return hash_equals($expected, $provided);
    }

    /** Builds a header the way PayMongo would — used by tests. */
    public static function sign(string $rawBody, string $secret, bool $live = false, ?int $timestamp = null): string
    {
        $timestamp ??= time();
        $sig = hash_hmac('sha256', $timestamp.'.'.$rawBody, $secret);

        return $live ? "t={$timestamp},te=,li={$sig}" : "t={$timestamp},te={$sig},li=";
    }
}
