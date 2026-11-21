<?php

namespace App\Support;

/**
 * Shared fixtures name dates relative to today as {TODAY-5} or {TODAY+2}, so a rule like
 * "the death was within the last 60 days" never goes stale. Used by the demo seeder and the tests.
 */
final class FixtureDates
{
    public static function expand(string $json): string
    {
        return preg_replace_callback(
            '/\{TODAY([+-]\d+)\}/',
            fn (array $m) => ParishClock::today()->addDays((int) $m[1])->toDateString(),
            $json,
        );
    }
}
