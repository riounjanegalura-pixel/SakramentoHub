<?php

use App\Enums\PaymentStatus;
use App\Models\Booking;
use App\Models\User;
use App\Services\Booking\BookingStateMachine;
use Database\Seeders\ServiceSeeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;

// Approval first: the office approves a booking, and only then can the parishioner pay it.

beforeEach(function () {
    $this->seed(ServiceSeeder::class);
    config([
        'paymongo.approval_before_payment' => true,
        'paymongo.simulated' => true, // "Pay" answers with our own page, no PayMongo call needed
        'paymongo.secret_key' => 'sk_test_fake',
        'app.parishioner_url' => 'https://parish.example',
    ]);
    Http::preventStrayRequests();
    Carbon::setTestNow(Carbon::parse('2026-11-02 00:00:00', 'UTC'));
});

afterEach(fn () => Carbon::setTestNow());

function reviewBooking(User $owner, array $overrides = []): Booking
{
    return Booking::factory()->create(array_merge([
        'user_id' => $owner->id,
        'sacrament' => 'wedding',
        'status' => 'submitted',
        'payment_status' => PaymentStatus::Unpaid,
        'payment_hold_expires_at' => null,
        'amount_due_centavos' => 500000,
    ], $overrides));
}

test('a booking waiting for review cannot be paid yet, and says so', function () {
    $user = User::factory()->create();
    $booking = reviewBooking($user);

    $this->actingAs($user)->postJson("/api/bookings/{$booking->id}/payment")
        ->assertStatus(422)
        ->assertJsonPath('message', 'The parish office has not approved this booking yet. You can pay once it is approved.');

    $this->actingAs($user)->getJson("/api/bookings/{$booking->id}")->assertOk()->assertJsonPath('canPayNow', false);
});

test('the office can approve an unpaid booking, which opens its payment window', function () {
    $staff = User::factory()->create(['role' => 'staff']);
    $booking = reviewBooking(User::factory()->create());

    $this->actingAs($staff)->patchJson("/api/admin/bookings/{$booking->id}/approve")->assertOk();

    $fresh = $booking->fresh();
    expect($fresh->status->value)->toBe('approved')
        ->and($fresh->payment_status)->toBe(PaymentStatus::Unpaid)
        ->and($fresh->payment_hold_expires_at?->isFuture())->toBeTrue();
});

test('once approved, the owner can pay it', function () {
    $user = User::factory()->create();
    $booking = reviewBooking($user);
    $this->actingAs(User::factory()->create(['role' => 'staff']))->patchJson("/api/admin/bookings/{$booking->id}/approve")->assertOk();

    $this->actingAs($user)->getJson("/api/bookings/{$booking->id}")->assertOk()->assertJsonPath('canPayNow', true);
    $this->actingAs($user)->postJson("/api/bookings/{$booking->id}/payment")
        ->assertOk()
        ->assertJsonPath('checkoutUrl', "https://parish.example/payment/simulated?bookingId={$booking->id}");
});

test('a confirmed payment on an approved booking marks it paid and keeps it approved', function () {
    $booking = reviewBooking(User::factory()->create(), ['status' => 'approved', 'payment_hold_expires_at' => now()->addHours(24)]);

    $result = app(BookingStateMachine::class)->recordPayment($booking, 'pi_x', 'pay_1', 500000, 'evt_1');

    expect($result)->toBe('processed')
        ->and($booking->fresh()->payment_status)->toBe(PaymentStatus::Paid)
        ->and($booking->fresh()->status->value)->toBe('approved');
});

test('an approved booking that is not paid in time is cancelled by the expiry job', function () {
    $booking = reviewBooking(User::factory()->create(), ['status' => 'approved', 'payment_hold_expires_at' => now()->subMinute()]);

    $this->artisan('bookings:expire-holds')->assertSuccessful();

    expect($booking->fresh()->status->value)->toBe('cancelled');
});

test('a booking waiting for review is never expired for non-payment', function () {
    $booking = reviewBooking(User::factory()->create());

    $this->artisan('bookings:expire-holds')->assertSuccessful();

    expect($booking->fresh()->status->value)->toBe('submitted');
});

test('with the setting off, payment is open while the booking waits for review, as before', function () {
    config(['paymongo.approval_before_payment' => false]);
    $user = User::factory()->create();
    $booking = reviewBooking($user, ['payment_hold_expires_at' => now()->addHours(48)]);

    $this->actingAs($user)->postJson("/api/bookings/{$booking->id}/payment")->assertOk();
});

test('the booking says whether it is approved before it is paid, so the admin screen can let Approve through', function () {
    $staff = User::factory()->create(['role' => 'staff']);
    $online = reviewBooking(User::factory()->create());
    $walkIn = reviewBooking(User::factory()->create(), ['channel' => 'walk_in']);

    $this->actingAs($staff)->getJson("/api/admin/bookings/{$online->id}")->assertOk()->assertJsonPath('paymentAfterApproval', true);
    $this->actingAs($staff)->getJson("/api/admin/bookings/{$walkIn->id}")->assertOk()->assertJsonPath('paymentAfterApproval', false);

    config(['paymongo.approval_before_payment' => false]);
    $this->actingAs($staff)->getJson("/api/admin/bookings/{$online->id}")->assertOk()->assertJsonPath('paymentAfterApproval', false);
});
