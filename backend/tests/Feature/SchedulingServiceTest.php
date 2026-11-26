<?php
// backend/tests/Feature/SchedulingServiceTest.php

use App\Models\Booking;
use App\Models\ParishEvent;
use App\Models\Service;
use App\Services\Scheduling\AppointmentRequest;
use App\Services\Scheduling\SchedulingService;
use Database\Seeders\ParishSettingSeeder;
use Database\Seeders\ServiceSeeder;
use Illuminate\Support\Carbon;

beforeEach(function () {
    $this->seed(ServiceSeeder::class);
    $this->seed(ParishSettingSeeder::class);
    Carbon::setTestNow(Carbon::parse('2026-11-02 00:00:00', 'UTC')); // Mon 2026-11-02 08:00 Manila
    $this->scheduling = app(SchedulingService::class);
});

afterEach(fn () => Carbon::setTestNow());

function req(string $sacrament, string $date, ?string $start = null, array $context = []): AppointmentRequest
{
    return AppointmentRequest::make(Service::findOrFail($sacrament), $date, $start, $context);
}

function held(string $sacrament, string $date, string $start, string $end, array $extra = []): Booking
{
    return Booking::factory()->scheduled($date, $start, $end)->create(array_merge([
        'sacrament' => $sacrament,
        'status' => 'approved',
        'payment_status' => 'not_required',
    ], $extra));
}

test('a date in the past is rejected', function () {
    expect($this->scheduling->dayRuleViolation(req('funeral', '2026-11-01')))->toBe('That date has already passed.');
});

test('past-date check uses the Manila date, not the UTC date', function () {
    Carbon::setTestNow(Carbon::parse('2026-11-01 23:30:00', 'UTC')); // 07:30 on 2026-11-02 in Manila
    expect($this->scheduling->dayRuleViolation(req('funeral', '2026-11-01')))->toBe('That date has already passed.');
});

test('lead time is enforced per sacrament', function () {
    expect($this->scheduling->dayRuleViolation(req('confirmation', '2026-11-10')))
        ->toBe('Confirmation must be booked at least 14 days ahead.')
        ->and($this->scheduling->dayRuleViolation(req('confirmation', '2026-11-17')))->toBeNull();
});

test('weekday rules are enforced', function () {
    expect($this->scheduling->dayRuleViolation(req('house-blessing', '2026-11-09')))
        ->toBe('House Blessing & Other is not scheduled on Mondays.')
        ->and($this->scheduling->dayRuleViolation(req('wedding', '2027-01-31')))
        ->toBe('Wedding is not scheduled on Sundays.');
});

test('Good Friday blocks a wedding', function () {
    expect($this->scheduling->dayRuleViolation(req('wedding', '2027-03-26')))->toBe('Unavailable: Good Friday.');
});

test('free starts are offered one after another across working hours', function () {
    $starts = $this->scheduling->freeStarts(req('funeral', '2026-11-03'));
    expect($starts)->toBe(['08:00', '09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00']); // 60 minute visits, none in or through the 12:00 to 13:00 lunch
});

test('same-day starts begin at least an hour from now', function () {
    expect($this->scheduling->freeStarts(req('funeral', '2026-11-02'))[0])->toBe('09:00');
});

test('one priest: any held booking of another sacrament blocks overlapping starts', function () {
    held('wedding', '2026-11-03', '10:00', '11:30');
    $starts = $this->scheduling->freeStarts(req('funeral', '2026-11-03'));

    expect($starts)->toContain('09:00')->toContain('13:00')
        ->not->toContain('09:30')->not->toContain('10:00')->not->toContain('11:00');
});

test('off-site rites add a 30 minute travel buffer', function () {
    held('funeral', '2026-11-05', '10:00', '11:00');
    $starts = $this->scheduling->freeStarts(req('house-blessing', '2026-11-05'));

    // 45 minute blessings: 08:45 ends 09:30 and its 30 minute travel buffer ends exactly when the funeral starts.
    expect($starts)->toContain('08:45')->toContain('13:00')
        ->not->toContain('09:30')->not->toContain('11:00');
});

test('a house funeral Mass is treated as off-site', function () {
    expect(req('funeral', '2026-11-05', null, ['massType' => 'house'])->offsite)->toBeTrue()
        ->and(req('funeral', '2026-11-05', null, ['massType' => 'church'])->offsite)->toBeFalse();
});

test('a parish Mass blocks the priest', function () {
    ParishEvent::create([
        'title' => 'Noon Mass', 'date' => \Illuminate\Support\Carbon::parse('2026-11-03 12:00', 'Asia/Manila')->utc(), 'location' => 'Parish church',
        'category' => 'mass', 'duration_minutes' => 60,
    ]);
    $starts = $this->scheduling->freeStarts(req('funeral', '2026-11-03'));

    expect($starts)->toContain('11:00')->toContain('13:00')->not->toContain('11:30')->not->toContain('12:00');
});

test('the Sunday baptism session reserves the priest and has its own seats', function () {
    $session = req('baptism', '2026-11-15', null, ['scheduleType' => 'regular']);
    expect($this->scheduling->freeStarts($session))->toBe(['10:00']);

    foreach (range(1, 10) as $i) {
        held('baptism', '2026-11-15', '10:00', '11:00', ['payment_status' => 'paid']);
    }
    expect($this->scheduling->freeStarts($session))->toBe([])
        ->and($this->scheduling->dayStatus($session)['status'])->toBe('full');

    $funeralStarts = $this->scheduling->freeStarts(req('funeral', '2026-11-15'));
    expect($funeralStarts)->not->toContain('10:00')->toContain('11:00');
});

test('special baptism is not offered on Sunday', function () {
    expect($this->scheduling->dayRuleViolation(req('baptism', '2026-11-15', null, ['scheduleType' => 'special'])))
        ->toBe('Baptism is not scheduled on Sundays.');
});

test('daily capacity closes the day for that sacrament', function () {
    held('wedding', '2027-02-02', '08:00', '09:30', ['payment_status' => 'paid']);
    held('wedding', '2027-02-02', '13:00', '14:30', ['payment_status' => 'paid']);

    expect($this->scheduling->freeStarts(req('wedding', '2027-02-02')))->toBe([])
        ->and($this->scheduling->dayStatus(req('wedding', '2027-02-02'))['status'])->toBe('full');
});

test('an unpaid booking past its 48 hour hold no longer blocks', function () {
    held('funeral', '2026-11-03', '10:00', '11:00', [
        'status' => 'submitted', 'payment_status' => 'unpaid', 'payment_hold_expires_at' => now()->subHour(),
    ]);
    expect($this->scheduling->freeStarts(req('funeral', '2026-11-03')))->toContain('10:00');
});

test('a returned booking past its 7 day hold no longer blocks', function () {
    held('funeral', '2026-11-03', '10:00', '11:00', ['status' => 'returned', 'returned_at' => now()->subDays(8)]);
    expect($this->scheduling->freeStarts(req('funeral', '2026-11-03')))->toContain('10:00');
});

test('check() explains a taken time and accepts a free one, excluding the booking itself', function () {
    $mine = held('funeral', '2026-11-03', '10:00', '11:00');

    expect($this->scheduling->check(req('funeral', '2026-11-03', '10:00')))
        ->toBe('That time is no longer available. Please choose another.')
        ->and($this->scheduling->check(req('funeral', '2026-11-03', '10:00'), $mine->id))->toBeNull()
        ->and($this->scheduling->check(req('funeral', '2026-11-03')))->toBe('Choose a start time.');
});

test('end time follows the rite duration', function () {
    expect($this->scheduling->endFor(req('wedding', '2027-02-02', '10:00')))->toBe('11:30')
        ->and($this->scheduling->endFor(req('baptism', '2026-11-15', '10:00', ['scheduleType' => 'regular'])))->toBe('11:00');
});

test('day status distinguishes free, limited and unavailable', function () {
    expect($this->scheduling->dayStatus(req('funeral', '2026-11-03'))['status'])->toBe('free');
    held('wedding', '2026-11-03', '10:00', '11:30');
    expect($this->scheduling->dayStatus(req('funeral', '2026-11-03'))['status'])->toBe('limited');

    $closed = $this->scheduling->dayStatus(req('house-blessing', '2026-11-09'));
    expect($closed['status'])->toBe('unavailable')
        ->and($closed['reason'])->toBe('House Blessing & Other is not scheduled on Mondays.');
});

test('a session time outside working hours is refused with the hours in the message', function () {
    $baptism = Service::findOrFail('baptism');
    $session = fn (?string $time) => req('baptism', '2026-11-15', $time, ['scheduleType' => 'regular']);

    $baptism->update(['session_times' => ['10:00', '18:00', '16:30']]); // hours are 08:00–17:00, a session lasts 60 minutes
    expect($this->scheduling->check($session('10:00')))->toBeNull()
        ->and($this->scheduling->check($session('18:00')))->toBe('Baptism sessions must fall within working hours (08:00–17:00).')
        ->and($this->scheduling->check($session('16:30')))->toBe('Baptism sessions must fall within working hours (08:00–17:00).')
        ->and($this->scheduling->freeStarts($session(null)))->toBe(['10:00']);
});

test('no visit starts in or runs through the lunch break', function () {
    $starts = $this->scheduling->freeStarts(req('funeral', '2026-11-03'));

    expect($starts)->toContain('11:00')->toContain('13:00')
        ->not->toContain('11:30')->not->toContain('12:00')->not->toContain('12:30');
});
