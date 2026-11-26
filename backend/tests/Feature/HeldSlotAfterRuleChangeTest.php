<?php
// backend/tests/Feature/HeldSlotAfterRuleChangeTest.php

use App\Enums\BookingStatus;
use App\Exceptions\BookingRuleViolation;
use App\Models\BlackoutDate;
use App\Models\Booking;
use App\Models\ParishEvent;
use App\Models\ParishSetting;
use App\Models\Service;
use App\Models\User;
use App\Services\Booking\BookingStateMachine;
use App\Services\Scheduling\SchedulingService;
use Database\Seeders\ParishSettingSeeder;
use Database\Seeders\ServiceSeeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Storage;

// A slot a booking already holds is only re-checked for hard conflicts (past, blackout,
// capacity, priest overlap); rule changes (slot step, hours, weekdays, session times) never strand it.

beforeEach(function () {
    $this->seed(ServiceSeeder::class);
    $this->seed(ParishSettingSeeder::class);
    Storage::fake('local');
    Carbon::setTestNow(Carbon::parse('2026-11-02 00:00:00', 'UTC')); // Mon 08:00 Manila
    $this->sm = app(BookingStateMachine::class);
    $this->owner = User::factory()->create(['email_verified_at' => now()]);
    $this->staff = User::factory()->create(['role' => 'staff']);
});

afterEach(fn () => Carbon::setTestNow());

/** Submitted (and, for priced services, marked paid) so approve only has the schedule left to check. */
function submittedHeldSlot(User $owner, string $sacrament, string $fixture, string $date, string $start): Booking
{
    $draft = Booking::factory()->create([
        'user_id' => $owner->id,
        'sacrament' => $sacrament,
        'status' => 'draft',
        'form_data' => formDataFixture($fixture, $owner->id),
        'appointment_date' => $date,
        'appointment_start' => $start,
    ]);
    $b = app(BookingStateMachine::class)->submit($draft, $owner);
    if ($b->payment_status->value === 'unpaid') {
        $b->update(['payment_status' => 'paid']);
    }
    acceptAllDocuments($b);

    return $b->fresh();
}

function approvedElsewhere(string $sacrament, string $date, string $start, string $end, array $extra = []): Booking
{
    return Booking::factory()->scheduled($date, $start, $end)->create(array_merge([
        'sacrament' => $sacrament,
        'status' => 'approved',
        'payment_status' => 'not_required',
    ], $extra));
}

/**
 * A house blessing held at 10:30 on a Tuesday. Visits are now offered back to back (10:15 is on the grid, 10:30 is not),
 * so it is submitted at 10:15 and then moved to 10:30: the off-grid hold these tests are about, as a rule change leaves it.
 */
function houseBlessingAt1030(): Booking
{
    $b = submittedHeldSlot(test()->owner, 'house-blessing', 'house-blessing/valid-house', '2026-11-10', '10:15'); // Tue
    $b->update(['appointment_start' => '10:30', 'appointment_end' => '11:15']);

    return $b->fresh();
}

test('a held off-grid start can still be approved after the slot step changes', function () {
    $b = houseBlessingAt1030();
    ParishSetting::put('slot_step_minutes', 60);

    expect($this->sm->approve($b, $this->staff)->status)->toBe(BookingStatus::Approved);
});

test('a held start outside narrowed working hours can still be approved', function () {
    $b = houseBlessingAt1030();
    ParishSetting::put('working_hours_start', '13:00');

    expect($this->sm->approve($b, $this->staff)->status)->toBe(BookingStatus::Approved);
});

test('a held weekday the service no longer allows can still be approved', function () {
    $b = houseBlessingAt1030();
    Service::find('house-blessing')->update(['allowed_weekdays' => [3, 4, 5]]); // Tuesday removed

    expect($this->sm->approve($b, $this->staff)->status)->toBe(BookingStatus::Approved);
});

test('a baptism on a session time that was moved can still be approved', function () {
    $b = submittedHeldSlot($this->owner, 'baptism', 'baptism/valid-basic', '2026-11-15', '10:00');
    Service::find('baptism')->update(['session_times' => ['11:00']]);

    expect($this->sm->approve($b, $this->staff)->status)->toBe(BookingStatus::Approved);
});

test('a baptism on a session weekday that was removed can still be approved', function () {
    $b = submittedHeldSlot($this->owner, 'baptism', 'baptism/valid-basic', '2026-11-15', '10:00');
    Service::find('baptism')->update(['session_weekdays' => [6]]);

    expect($this->sm->approve($b, $this->staff)->status)->toBe(BookingStatus::Approved);
});

test('a returned booking resubmitted on its held slot after a step change is accepted and still listed', function () {
    $b = houseBlessingAt1030();
    $b = $this->sm->returnForChanges($b, $this->staff, 'Please add the street name.');
    ParishSetting::put('slot_step_minutes', 60);
    $b = $b->fresh();

    $status = app(SchedulingService::class)->dayStatus($b->appointmentRequest(), $b);
    expect($status['freeStarts'])->toContain('10:30');

    expect($this->sm->submit($b, $this->owner)->status)->toBe(BookingStatus::Submitted);
});

test('a returned booking moved to a different off-grid start is still refused', function () {
    $b = houseBlessingAt1030();
    $b = $this->sm->returnForChanges($b, $this->staff, 'Please add the street name.');
    ParishSetting::put('slot_step_minutes', 60);
    $b->update(['appointment_start' => '11:30']);

    expect(fn () => $this->sm->submit($b->fresh(), $this->owner))
        ->toThrow(BookingRuleViolation::class, 'That time is no longer available.')
        ->and($b->fresh()->status)->toBe(BookingStatus::Returned);
});

test('approval of an off-grid held slot is refused when another booking now overlaps the priest', function () {
    $b = houseBlessingAt1030();
    ParishSetting::put('slot_step_minutes', 60);
    approvedElsewhere('funeral', '2026-11-10', '11:00', '12:00');

    expect(fn () => $this->sm->approve($b, $this->staff))
        ->toThrow(BookingRuleViolation::class, 'Cannot approve: That time is no longer available.');
});

test('approval counts the travel buffer of an offsite held slot', function () {
    $b = houseBlessingAt1030(); // 10:30-11:15, offsite: needs 10:00-11:45 clear
    ParishSetting::put('slot_step_minutes', 60);
    approvedElsewhere('funeral', '2026-11-10', '11:30', '12:30'); // clear of 11:15, inside the 30 min buffer

    expect(fn () => $this->sm->approve($b, $this->staff))
        ->toThrow(BookingRuleViolation::class, 'Cannot approve: That time is no longer available.');
});

test('approval of an off-grid held slot is refused when a Mass overlaps it', function () {
    $b = houseBlessingAt1030();
    ParishSetting::put('slot_step_minutes', 60);
    ParishEvent::create(['title' => 'Weekday Mass', 'date' => Carbon::parse('2026-11-10 10:00', 'Asia/Manila')->utc(), 'location' => 'Parish church', 'category' => 'mass', 'duration_minutes' => 60]);

    expect(fn () => $this->sm->approve($b, $this->staff))
        ->toThrow(BookingRuleViolation::class, 'Cannot approve: That time is no longer available.');
});

test('approval of an off-grid held slot is refused when a blackout date is added', function () {
    $b = houseBlessingAt1030();
    ParishSetting::put('slot_step_minutes', 60);
    BlackoutDate::create(['date' => '2026-11-10', 'reason' => 'Parish fiesta']);

    expect(fn () => $this->sm->approve($b, $this->staff))
        ->toThrow(BookingRuleViolation::class, 'Cannot approve: Unavailable: Parish fiesta.');
});

test('approval of an off-grid held slot is refused when daily capacity is exceeded', function () {
    $b = submittedHeldSlot($this->owner, 'wedding', 'wedding/valid-basic', '2027-02-02', '09:30');
    $b->update(['appointment_start' => '10:30', 'appointment_end' => '12:00']); // off the back-to-back grid, as a rule change leaves it
    ParishSetting::put('slot_step_minutes', 60);
    approvedElsewhere('wedding', '2027-02-02', '13:00', '14:30');
    approvedElsewhere('wedding', '2027-02-02', '15:00', '16:30');

    expect(fn () => $this->sm->approve($b, $this->staff))
        ->toThrow(BookingRuleViolation::class, 'Cannot approve: That time is no longer available.');
});

test('approval of a session booking is refused when the session is over capacity', function () {
    $b = submittedHeldSlot($this->owner, 'baptism', 'baptism/valid-basic', '2026-11-15', '10:00');
    Service::find('baptism')->update(['session_times' => ['11:00'], 'session_capacity' => 1]);
    approvedElsewhere('baptism', '2026-11-15', '10:00', '11:00');

    expect(fn () => $this->sm->approve($b, $this->staff))
        ->toThrow(BookingRuleViolation::class, 'Cannot approve: That time is no longer available.');
});

test('a session booking shares its session with others of the same sacrament', function () {
    $b = submittedHeldSlot($this->owner, 'baptism', 'baptism/valid-basic', '2026-11-15', '10:00');
    Service::find('baptism')->update(['session_times' => ['11:00']]);
    approvedElsewhere('baptism', '2026-11-15', '10:00', '11:00');

    expect($this->sm->approve($b, $this->staff)->status)->toBe(BookingStatus::Approved);
});
