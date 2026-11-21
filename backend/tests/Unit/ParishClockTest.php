<?php

use App\Support\ParishClock;
use Illuminate\Support\Carbon;
use Tests\TestCase;

// Unit tests don't boot the app by default; ParishClock reads config().
uses(TestCase::class);

test('parish today is the Manila date even when UTC is still the previous day', function () {
    Carbon::setTestNow(Carbon::parse('2026-11-04 23:30:00', 'UTC')); // 07:30 Nov 5 in Manila
    expect(ParishClock::todayString())->toBe('2026-11-05');
    Carbon::setTestNow();
});

test('parish now carries the Manila offset', function () {
    Carbon::setTestNow(Carbon::parse('2026-11-04 23:30:00', 'UTC'));
    expect(ParishClock::now()->format('Y-m-d H:i'))->toBe('2026-11-05 07:30');
    Carbon::setTestNow();
});
