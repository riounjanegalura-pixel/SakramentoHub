<?php

use App\Enums\PaymentStatus;
use App\Models\Booking;
use App\Models\User;
use Database\Seeders\ServiceSeeder;

// With the ₱1 testing switch on, ₱1 is what is charged and stored, but the screens show the fee the parish set.

beforeEach(function () {
    $this->seed(ServiceSeeder::class);
});

function submittedWedding(User $owner): Booking
{
    return Booking::factory()->create([
        'user_id' => $owner->id,
        'sacrament' => 'wedding',
        'status' => 'submitted',
        'payment_status' => PaymentStatus::Unpaid,
        'payment_hold_expires_at' => now()->addHours(48),
        'amount_due_centavos' => 100, // what the switch stored: ₱1.00
    ]);
}

test('with the switch on, the charge stays at ₱1 but the booking shows the real fee', function () {
    config(['paymongo.one_peso_test_prices' => true]);
    $user = User::factory()->create();
    $booking = submittedWedding($user);
    $real = $booking->realFeeCentavos();

    expect($real)->toBeGreaterThan(100)
        ->and((int) $booking->amount_due_centavos)->toBe(100);

    $this->actingAs($user)->getJson("/api/bookings/{$booking->id}")
        ->assertOk()
        ->assertJsonPath('amountDueCentavos', $real);
});

test('with the switch off, the booking shows what is stored', function () {
    config(['paymongo.one_peso_test_prices' => false]);
    $user = User::factory()->create();
    $booking = submittedWedding($user);
    $booking->update(['amount_due_centavos' => 500000]);

    $this->actingAs($user)->getJson("/api/bookings/{$booking->id}")
        ->assertOk()
        ->assertJsonPath('amountDueCentavos', 500000);
});

test('a free service stays free either way', function () {
    config(['paymongo.one_peso_test_prices' => true]);
    $user = User::factory()->create();
    $booking = Booking::factory()->create(['user_id' => $user->id, 'sacrament' => 'funeral', 'status' => 'submitted', 'amount_due_centavos' => 0]);

    expect($booking->displayAmountDueCentavos(false))->toBe(0);
});