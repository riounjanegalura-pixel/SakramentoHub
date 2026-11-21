<?php
// backend/tests/Unit/LiturgicalCalendarTest.php

use App\Models\BlackoutDate;
use App\Services\Scheduling\LiturgicalCalendar;

uses(Tests\TestCase::class, Illuminate\Foundation\Testing\RefreshDatabase::class);

test('computes Easter Sunday for known years', function (int $year, string $easter) {
    expect(app(LiturgicalCalendar::class)->easterSunday($year)->toDateString())->toBe($easter);
})->with([
    [2025, '2025-04-20'],
    [2026, '2026-04-05'],
    [2027, '2027-03-28'],
    [2038, '2038-04-25'],
]);

test('triduum is Holy Thursday to Holy Saturday', function () {
    expect(app(LiturgicalCalendar::class)->triduum(2026))->toBe([
        '2026-04-02' => 'Holy Thursday',
        '2026-04-03' => 'Good Friday',
        '2026-04-04' => 'Holy Saturday',
    ]);
});

test('triduum blocks weddings but not anointing', function () {
    $cal = app(LiturgicalCalendar::class);
    expect($cal->blackoutReason('2026-04-03', 'wedding'))->toBe('Good Friday')
        ->and($cal->blackoutReason('2026-04-03', 'anointing'))->toBeNull()
        ->and($cal->blackoutReason('2026-04-07', 'wedding'))->toBeNull();
});

test('admin blackout rows apply to their listed sacraments or to all', function () {
    BlackoutDate::create(['date' => '2026-12-08', 'reason' => 'Parish fiesta', 'sacraments' => ['wedding']]);
    BlackoutDate::create(['date' => '2026-12-24', 'reason' => 'Christmas Eve', 'sacraments' => null]);
    $cal = app(LiturgicalCalendar::class);

    expect($cal->blackoutReason('2026-12-08', 'wedding'))->toBe('Parish fiesta')
        ->and($cal->blackoutReason('2026-12-08', 'baptism'))->toBeNull()
        ->and($cal->blackoutReason('2026-12-24', 'funeral'))->toBe('Christmas Eve');
});
