<?php
// backend/tests/Feature/AdminBookingLifecycleTest.php

use App\Models\Booking;
use App\Models\User;
use Database\Seeders\ParishSettingSeeder;
use Database\Seeders\ServiceSeeder;
use Illuminate\Support\Carbon;

beforeEach(function () {
    $this->seed(ServiceSeeder::class);
    $this->seed(ParishSettingSeeder::class);
    Carbon::setTestNow(Carbon::parse('2026-11-02 00:00:00', 'UTC'));
    $this->staff = User::factory()->create(['role' => 'staff']);
});

afterEach(fn () => Carbon::setTestNow());

function submittedFuneral(array $extra = []): Booking
{
    return Booking::factory()->scheduled('2026-11-03', '10:00', '11:00')->create(array_merge([
        'sacrament' => 'funeral', 'status' => 'submitted', 'payment_status' => 'not_required',
    ], $extra));
}

test('decline requires a reason and records it', function () {
    $b = submittedFuneral();
    $this->actingAs($this->staff)->patchJson("/api/admin/bookings/{$b->id}/decline")->assertUnprocessable();
    $this->actingAs($this->staff)->patchJson("/api/admin/bookings/{$b->id}/decline", ['reason' => 'Duplicate request'])
        ->assertOk()->assertJsonPath('status', 'declined')->assertJsonPath('statusLabel', 'Declined')
        ->assertJsonPath('statusReason', 'Duplicate request');
});

test('the old reject route no longer exists', function () {
    $b = submittedFuneral();
    $this->actingAs($this->staff)->patchJson("/api/admin/bookings/{$b->id}/reject", ['reason' => 'x'])->assertNotFound();
});

test('return for changes requires a note', function () {
    $b = submittedFuneral();
    $this->actingAs($this->staff)->patchJson("/api/admin/bookings/{$b->id}/return")->assertUnprocessable();
    $this->actingAs($this->staff)->patchJson("/api/admin/bookings/{$b->id}/return", ['note' => 'Upload the death certificate again'])
        ->assertOk()->assertJsonPath('status', 'returned')->assertJsonPath('returnNote', 'Upload the death certificate again');
});

test('staff can cancel an approved booking at any time', function () {
    $b = submittedFuneral(['status' => 'approved']);
    $this->actingAs($this->staff)->patchJson("/api/admin/bookings/{$b->id}/cancel", ['reason' => 'Family request'])
        ->assertOk()->assertJsonPath('status', 'cancelled');
});

test('complete is refused before the appointment date', function () {
    $b = submittedFuneral(['status' => 'approved']);
    $this->actingAs($this->staff)->patchJson("/api/admin/bookings/{$b->id}/complete")
        ->assertUnprocessable()
        ->assertJsonPath('message', 'A booking can only be completed on or after its appointment date.');
});

test('mark refunded records the reference', function () {
    $b = submittedFuneral(['status' => 'cancelled', 'payment_status' => 'refund_due']);
    $this->actingAs($this->staff)->patchJson("/api/admin/bookings/{$b->id}/refund", ['reference' => 'PM-REF-9'])
        ->assertOk()->assertJsonPath('paymentStatus', 'refunded')->assertJsonPath('refundReference', 'PM-REF-9');
});

test('approve is refused while payment is unpaid', function () {
    $b = submittedFuneral(['sacrament' => 'wedding', 'payment_status' => 'unpaid', 'payment_hold_expires_at' => now()->addDay()]);
    $this->actingAs($this->staff)->patchJson("/api/admin/bookings/{$b->id}/approve")->assertUnprocessable();
});

test('parishioners cannot use admin actions', function () {
    $b = submittedFuneral();
    $this->actingAs(User::factory()->create())->patchJson("/api/admin/bookings/{$b->id}/decline", ['reason' => 'x'])->assertForbidden();
});

test('an unknown status filter is rejected', function () {
    $this->actingAs($this->staff)->getJson('/api/admin/bookings?status=rejected')->assertUnprocessable();
});

test('priority view puts emergencies first, then urgent sacraments by appointment', function () {
    $wedding = Booking::factory()->scheduled('2026-12-01', '10:00', '11:30')->create(['sacrament' => 'wedding', 'status' => 'submitted']);
    $laterFuneral = submittedFuneral(['appointment_date' => '2026-11-06']);
    $soonerFuneral = submittedFuneral();
    $emergency = Booking::factory()->create(['sacrament' => 'anointing', 'status' => 'submitted', 'is_emergency' => true]);

    $ids = collect($this->actingAs($this->staff)->getJson('/api/admin/bookings?priority=1')->json('data'))->pluck('id')->all();

    expect($ids)->toBe([$emergency->id, $soonerFuneral->id, $laterFuneral->id, $wedding->id]);
});
