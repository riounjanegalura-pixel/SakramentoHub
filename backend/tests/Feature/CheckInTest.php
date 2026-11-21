<?php

use App\Models\AuditLog;
use App\Models\Booking;
use App\Models\User;
use Database\Seeders\ParishSettingSeeder;
use Database\Seeders\ServiceSeeder;
use Illuminate\Support\Carbon;

beforeEach(function () {
    $this->seed(ServiceSeeder::class);
    $this->seed(ParishSettingSeeder::class);
    config(['app.admin_url' => 'https://admin.example.test/']);
    Carbon::setTestNow(Carbon::parse('2026-11-05 02:00:00', 'UTC')); // Thu 10:00 in Manila
    $this->user = User::factory()->create(['role' => 'parishioner', 'full_name' => 'Rita Reyes']);
    $this->staff = User::factory()->create(['role' => 'staff', 'full_name' => 'Sam Staff']);
    $this->admin = User::factory()->create(['role' => 'admin', 'full_name' => 'Ada Admin']);
});
afterEach(fn () => Carbon::setTestNow());

function passBooking(array $over = [], string $date = '2026-11-05'): Booking
{
    return Booking::factory()->scheduled($date, '10:00', '11:00')->create($over + [
        'user_id' => test()->user->id, 'sacrament' => 'house-blessing', 'status' => 'approved', 'payment_status' => 'not_required',
        'form_data' => ['propertyOwner' => 'Rita Reyes'],
    ]);
}

test('staff check in an approved booking on its appointment day, and it is audited without changing the status', function () {
    $booking = passBooking();

    $res = $this->actingAs($this->staff)->postJson("/api/admin/bookings/{$booking->id}/check-in")->assertOk();
    $res->assertJsonPath('status', 'approved')->assertJsonPath('checkedInAt', now()->toISOString())
        ->assertJsonPath('checkedInBy', ['id' => $this->staff->id, 'fullName' => 'Sam Staff']);

    $row = $booking->fresh();
    expect($row->checked_in_at)->not->toBeNull()->and($row->checked_in_by)->toBe($this->staff->id)->and($row->status->value)->toBe('approved');
    $log = AuditLog::where('action', 'booking.checked_in')->first();
    expect($log->subject_type)->toBe('booking')->and($log->subject_id)->toBe($booking->id)->and($log->actor_user_id)->toBe($this->staff->id)
        ->and($log->metadata['reference'])->toBe($booking->reference_number);
});

test('an admin can check in too', function () {
    $booking = passBooking();

    $this->actingAs($this->admin)->postJson("/api/admin/bookings/{$booking->id}/check-in")->assertOk()->assertJsonPath('checkedInBy.fullName', 'Ada Admin');
});

test('only an approved booking can be checked in', function () {
    foreach (['submitted', 'draft', 'returned', 'completed', 'cancelled', 'declined'] as $status) {
        $booking = passBooking(['status' => $status]);

        $this->actingAs($this->staff)->postJson("/api/admin/bookings/{$booking->id}/check-in")
            ->assertUnprocessable()->assertExactJson(['message' => 'Only an approved booking can be checked in.']);
        expect($booking->fresh()->checked_in_at)->toBeNull();
    }
});

test('check-in opens on the appointment day, in parish time', function () {
    $tomorrow = passBooking([], '2026-11-06');
    $yesterday = passBooking([], '2026-11-04');

    $this->actingAs($this->staff)->postJson("/api/admin/bookings/{$tomorrow->id}/check-in")
        ->assertUnprocessable()->assertExactJson(['message' => 'Check-in opens on the appointment day (November 6, 2026).']);
    $this->actingAs($this->staff)->postJson("/api/admin/bookings/{$yesterday->id}/check-in")
        ->assertUnprocessable()->assertExactJson(['message' => 'Check-in opens on the appointment day (November 4, 2026).']);

    // 17:00 UTC on the 4th is already the 5th in Manila.
    Carbon::setTestNow(Carbon::parse('2026-11-04 17:00:00', 'UTC'));
    $today = passBooking([], '2026-11-05');
    $this->actingAs($this->staff)->postJson("/api/admin/bookings/{$today->id}/check-in")->assertOk();
});

test('a booking cannot be checked in twice', function () {
    $booking = passBooking();
    $this->actingAs($this->staff)->postJson("/api/admin/bookings/{$booking->id}/check-in")->assertOk();

    Carbon::setTestNow(Carbon::parse('2026-11-05 06:05:00', 'UTC')); // 14:05 in Manila
    $this->actingAs($this->staff)->postJson("/api/admin/bookings/{$booking->id}/check-in")
        ->assertUnprocessable()->assertExactJson(['message' => 'Already checked in at 10:00 AM.']);
    expect(AuditLog::where('action', 'booking.checked_in')->count())->toBe(1);
});

test('an approved booking with no appointment has nothing to check in for', function () {
    $urgent = Booking::factory()->create(['user_id' => $this->user->id, 'sacrament' => 'anointing', 'status' => 'approved', 'is_emergency' => true]);

    $this->actingAs($this->staff)->postJson("/api/admin/bookings/{$urgent->id}/check-in")->assertUnprocessable()
        ->assertExactJson(['message' => 'This booking has no appointment to check in for.']);
});

test('check-in is for the office only', function () {
    $booking = passBooking();

    $this->actingAs($this->user)->postJson("/api/admin/bookings/{$booking->id}/check-in")->assertForbidden();
    $this->actingAs($this->staff)->postJson('/api/admin/bookings/'.\Illuminate\Support\Str::uuid().'/check-in')->assertNotFound();
    expect($booking->fresh()->checked_in_at)->toBeNull();
});

test('a booking is found by its reference in any letter case, with stray spaces', function () {
    $booking = passBooking();
    $ref = $booking->reference_number;

    foreach ([$ref, strtolower($ref), '  '.ucfirst(strtolower($ref)).' '] as $typed) {
        $this->actingAs($this->staff)->getJson('/api/admin/bookings/by-reference/'.rawurlencode($typed))->assertOk()
            ->assertJsonPath('id', $booking->id)->assertJsonPath('referenceNumber', $ref)->assertJsonStructure(['user', 'checkedInAt', 'checkedInBy', 'dayPass']);
    }
    $this->actingAs($this->admin)->getJson('/api/admin/bookings/by-reference/'.$ref)->assertOk();
});

test('an unknown reference is a 404 with a message, and parishioners are refused', function () {
    $booking = passBooking();

    $this->actingAs($this->staff)->getJson('/api/admin/bookings/by-reference/NOPE-20260101-ZZZZ')->assertNotFound()->assertExactJson(['message' => 'No booking with that reference.']);
    $this->actingAs($this->user)->getJson('/api/admin/bookings/by-reference/'.$booking->reference_number)->assertForbidden();
});

test('an approved booking with an appointment carries a day pass on the parishioner detail', function () {
    $booking = passBooking();

    $pass = $this->actingAs($this->user)->getJson("/api/bookings/{$booking->id}")->assertOk()->json('dayPass');
    expect($pass['url'])->toBe("https://admin.example.test/check-in/{$booking->reference_number}")
        ->and($pass['qrSvg'])->toStartWith('<svg')->and($pass['qrSvg'])->toContain('</svg>')
        ->and($pass['qrSvg'])->not->toContain('<?xml');
    $this->actingAs($this->user)->getJson("/api/bookings/{$booking->id}")->assertJsonPath('checkedInAt', null);
});

test('there is no day pass for a booking that is not approved or has no appointment', function () {
    foreach (['submitted', 'draft', 'returned', 'completed', 'cancelled'] as $status) {
        $booking = passBooking(['status' => $status]);

        $this->actingAs($this->user)->getJson("/api/bookings/{$booking->id}")->assertOk()->assertJsonPath('dayPass', null);
    }
    $urgent = Booking::factory()->create(['user_id' => $this->user->id, 'sacrament' => 'anointing', 'status' => 'approved', 'is_emergency' => true]);
    $this->actingAs($this->user)->getJson("/api/bookings/{$urgent->id}")->assertOk()->assertJsonPath('dayPass', null);
});

test('an approved booking with an unpaid fee has no day pass until payment is recorded', function () {
    $booking = passBooking(['payment_status' => 'unpaid', 'amount_due_centavos' => 25000]);

    $this->actingAs($this->user)->getJson("/api/bookings/{$booking->id}")->assertOk()->assertJsonPath('dayPass', null);

    $booking->update(['payment_status' => 'paid', 'paid_at' => now()]);
    $this->actingAs($this->user)->getJson("/api/bookings/{$booking->id}")->assertOk()->assertJsonPath('dayPass.url', "https://admin.example.test/check-in/{$booking->reference_number}");
});

test('the pass shows when the booking was checked in', function () {
    $booking = passBooking();
    $this->actingAs($this->staff)->postJson("/api/admin/bookings/{$booking->id}/check-in")->assertOk();

    $this->actingAs($this->user)->getJson("/api/bookings/{$booking->id}")->assertOk()->assertJsonPath('checkedInAt', now()->toISOString());
});

test('list responses never render a QR code', function () {
    passBooking();
    passBooking([], '2026-11-06');

    $mine = $this->actingAs($this->user)->getJson('/api/bookings')->assertOk();
    expect($mine->json())->toHaveCount(2)->and($mine->getContent())->not->toContain('qrSvg')->and($mine->getContent())->not->toContain('<svg');
    expect($mine->json('0.checkedInAt'))->toBeNull();

    foreach (['/api/admin/bookings', '/api/admin/bookings?priority=1'] as $url) {
        $res = $this->actingAs($this->staff)->getJson($url)->assertOk();
        expect($res->json('data'))->toHaveCount(2)->and($res->getContent())->not->toContain('qrSvg')->and($res->getContent())->not->toContain('<svg');
        expect($res->json('data.0'))->toHaveKeys(['checkedInAt', 'checkedInBy']);
    }
});

test('the single-booking responses on the office side carry the pass', function () {
    $booking = passBooking();

    foreach (["/api/admin/bookings/{$booking->id}", "/api/admin/bookings/by-reference/{$booking->reference_number}"] as $url) {
        $this->actingAs($this->staff)->getJson($url)->assertOk()->assertJsonPath('dayPass.url', "https://admin.example.test/check-in/{$booking->reference_number}");
    }
    expect($this->actingAs($this->staff)->getJson("/api/admin/bookings/{$booking->id}")->json('dayPass.qrSvg'))->toStartWith('<svg');
});

test('the schedule shows who has arrived', function () {
    $booking = passBooking();

    $item = fn () => collect($this->actingAs($this->staff)->getJson('/api/admin/schedule?start=2026-11-05&end=2026-11-05')->assertOk()->json('days.0.items'))->firstWhere('id', $booking->id);
    expect($item()['checkedInAt'])->toBeNull();

    $this->actingAs($this->staff)->postJson("/api/admin/bookings/{$booking->id}/check-in")->assertOk();
    expect($item()['checkedInAt'])->toBe(now()->toISOString());
});

test('completing after check-in works the same as before', function () {
    $booking = passBooking();
    $this->actingAs($this->staff)->postJson("/api/admin/bookings/{$booking->id}/check-in")->assertOk();

    $this->actingAs($this->staff)->patchJson("/api/admin/bookings/{$booking->id}/complete")->assertOk()->assertJsonPath('status', 'completed')->assertJsonPath('dayPass', null);
});

test('moving the appointment, by the owner or by the office, clears the check-in of the old day', function () {
    $mine = passBooking(['checked_in_at' => now(), 'checked_in_by' => $this->staff->id], '2026-11-20');
    $sm = app(\App\Services\Booking\BookingStateMachine::class);
    $sm->reschedule($mine, $this->user, '2026-11-24', '10:00');
    expect($mine->fresh()->checked_in_at)->toBeNull()->and($mine->fresh()->checked_in_by)->toBeNull();

    $office = passBooking(['checked_in_at' => now(), 'checked_in_by' => $this->staff->id], '2026-11-25');
    $sm->rescheduleByStaff($office, $this->staff, '2026-11-26', '10:00', 'Priest unavailable');
    expect($office->fresh()->checked_in_at)->toBeNull()->and($office->fresh()->checked_in_by)->toBeNull();
});
