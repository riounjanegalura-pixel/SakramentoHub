<?php
// backend/tests/Feature/AvailabilityTest.php

use App\Models\Booking;
use Database\Seeders\ParishSettingSeeder;
use Database\Seeders\ServiceSeeder;
use Illuminate\Support\Carbon;

beforeEach(function () {
    $this->seed(ServiceSeeder::class);
    $this->seed(ParishSettingSeeder::class);
    Carbon::setTestNow(Carbon::parse('2026-11-02 00:00:00', 'UTC'));
});

afterEach(fn () => Carbon::setTestNow());

test('single day returns status and free start times', function () {
    $this->getJson('/api/services/funeral/availability?date=2026-11-03')
        ->assertOk()
        ->assertJsonPath('status', 'free')
        ->assertJsonPath('freeStarts.0', '08:00');
});

test('single day explains why a day is unavailable', function () {
    $this->getJson('/api/services/house-blessing/availability?date=2026-11-09')
        ->assertOk()
        ->assertJsonPath('status', 'unavailable')
        ->assertJsonPath('reason', 'House Blessing & Other is not scheduled on Mondays.');
});

test('baptism regular schedule reports the Sunday session', function () {
    $this->getJson('/api/services/baptism/availability?date=2026-11-15&scheduleType=regular')
        ->assertOk()
        ->assertJsonPath('freeStarts', ['10:00']);
});

test('range returns one entry per day with a free count', function () {
    Booking::factory()->scheduled('2026-11-03', '10:00', '11:30')->create([
        'sacrament' => 'wedding', 'status' => 'approved', 'payment_status' => 'paid',
    ]);

    $days = $this->getJson('/api/services/funeral/availability-range?start=2026-11-02&end=2026-11-08')
        ->assertOk()
        ->assertJsonPath('sacrament', 'funeral')
        ->json('days');

    expect($days)->toHaveCount(7)
        ->and($days[1]['date'])->toBe('2026-11-03')
        ->and($days[1]['status'])->toBe('limited')
        ->and($days[1]['freeCount'])->toBeGreaterThan(0);
});

test('range rejects bad input', function (string $query) {
    $this->getJson("/api/services/funeral/availability-range?{$query}")->assertUnprocessable();
})->with([
    'end before start' => 'start=2026-11-10&end=2026-11-02',
    'too long' => 'start=2026-11-01&end=2027-01-15',
    'bad format' => 'start=11/02/2026&end=2026-11-10',
]);

test('unknown sacrament is 404', function () {
    $this->getJson('/api/services/exorcism/availability?date=2026-11-03')->assertNotFound();
});

// A returned booking still holds its slot. Its owner must be able to keep
// that slot when resubmitting, so they may ask for it to be left out.
function returnedConfirmation(App\Models\User $owner): Booking
{
    Illuminate\Support\Facades\Storage::fake('local');
    $sm = app(App\Services\Booking\BookingStateMachine::class);
    $staff = App\Models\User::factory()->create(['role' => 'staff']);
    $draft = Booking::factory()->create([
        'user_id' => $owner->id, 'sacrament' => 'confirmation',
        'form_data' => formDataFixture('confirmation/valid-basic', $owner->id),
        'appointment_date' => '2026-11-17', 'appointment_start' => '10:00',
    ]);

    return $sm->returnForChanges($sm->submit($draft, $owner), $staff, 'Please re-upload the certificate.');
}

test('a returned booking blocks its own slot unless its owner excludes it', function () {
    $owner = App\Models\User::factory()->create(['email_verified_at' => now()]);
    $booking = returnedConfirmation($owner);
    $url = '/api/services/confirmation/availability?date=2026-11-17';

    expect($this->getJson($url)->assertOk()->json('freeStarts'))->not->toContain('10:00');
    expect($this->actingAs($owner)->getJson("{$url}&excludeBookingId={$booking->id}")->assertOk()->json('freeStarts'))->toContain('10:00');
});

test('excludeBookingId is ignored for a guest, another user, or an unknown id', function () {
    $owner = App\Models\User::factory()->create(['email_verified_at' => now()]);
    $booking = returnedConfirmation($owner);
    $url = "/api/services/confirmation/availability?date=2026-11-17&excludeBookingId={$booking->id}";

    expect($this->getJson($url)->assertOk()->json('freeStarts'))->not->toContain('10:00');
    expect($this->actingAs(App\Models\User::factory()->create())->getJson($url)->assertOk()->json('freeStarts'))->not->toContain('10:00');
    $this->actingAs($owner)->getJson('/api/services/confirmation/availability?date=2026-11-17&excludeBookingId='.Illuminate\Support\Str::uuid())
        ->assertOk();
});

test('the slot a returned booking holds stays selectable for its owner after lead time has passed', function () {
    $owner = App\Models\User::factory()->create(['email_verified_at' => now()]);
    $booking = returnedConfirmation($owner);
    Carbon::setTestNow(now()->addDays(2)); // 2026-11-17 is now inside the 14-day lead time

    $this->getJson('/api/services/confirmation/availability?date=2026-11-17')->assertJsonPath('status', 'unavailable');

    $this->actingAs($owner)->getJson("/api/services/confirmation/availability?date=2026-11-17&excludeBookingId={$booking->id}")
        ->assertOk()
        ->assertJsonPath('freeStarts', ['10:00']) // only the held start; any other start is a new booking-time choice
        ->assertJsonPath('reason', null);

    $days = $this->actingAs($owner)
        ->getJson("/api/services/confirmation/availability-range?start=2026-11-16&end=2026-11-18&excludeBookingId={$booking->id}")
        ->assertOk()->json('days');
    expect($days[1]['freeCount'])->toBe(1)->and($days[1]['status'])->not->toBe('unavailable')
        ->and($days[0]['status'])->toBe('unavailable');
});

test('once a returned booking is moved to another slot, its old one is no longer held open', function () {
    $owner = App\Models\User::factory()->create(['email_verified_at' => now()]);
    $booking = returnedConfirmation($owner);
    Carbon::setTestNow(now()->addDays(2));
    $booking->update(['appointment_date' => '2026-11-12', 'appointment_start' => '10:00', 'appointment_end' => '11:00']);

    $this->actingAs($owner)->getJson("/api/services/confirmation/availability?date=2026-11-12&excludeBookingId={$booking->id}")
        ->assertJsonPath('status', 'unavailable');
});
