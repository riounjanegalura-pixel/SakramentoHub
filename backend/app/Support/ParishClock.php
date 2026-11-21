<?php

namespace App\Support;

use Carbon\CarbonImmutable;

final class ParishClock
{
    public static function now(): CarbonImmutable
    {
        return CarbonImmutable::now()->setTimezone(config('app.parish_timezone', 'Asia/Manila'));
    }

    public static function today(): CarbonImmutable
    {
        return self::now()->startOfDay();
    }

    public static function todayString(): string
    {
        return self::today()->toDateString();
    }
}
