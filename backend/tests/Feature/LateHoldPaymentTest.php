<?php

use App\Enums\PaymentStatus;
use App\Models\User;
use Database\Seeders\ServiceSeeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;

// pendingBooking(), paidEvent() and postWebhook() are the global helpers declared in PaymentTest.php.

beforeEach(function () {
    $this->seed(ServiceSeeder::class);
    config([
        'paymongo.mode' => 'test',
        'paymongo.secret_key' => 'sk_test_fake',
        'paymongo.webhook_secret' => TEST_WEBHOOK_SECRET,
        'paymongo.auto_approve_on_payment' => false,
    ]);
    Http::preventStrayRequests();
    Carbon::setTestNow(Carbon::parse('2026-11-02 00:00:00', 'UTC'));
});

afterEach(fn () => Carbon::setTestNow());

test('a paid event after the unpaid hold has lapsed is refund due, not paid', function () {
    $owner = User::factory()->create(['role' => 'parishioner', 'email_verified_at' => now()]);
    $booking = pendingBooking($owner, ['status' => 'submitted', 'payment_status' => 'unpaid', 'payment_hold_expires_at' => now()->subMinute()]);

    $response = postWebhook($this, paidEvent($booking->id, 'cs_late_1', (int) $booking->amount_due_centavos));

    $response->assertOk()->assertJsonFragment(['result' => 'refund_due']);
    $fresh = $booking->fresh();
    expect($fresh->payment_status)->toBe(PaymentStatus::RefundDue);
    expect($fresh->status->value)->toBe('submitted');
});

test('a paid event on a returned booking whose 7-day hold has lapsed is refund due', function () {
    $owner = User::factory()->create(['role' => 'parishioner', 'email_verified_at' => now()]);
    $booking = pendingBooking($owner, [
        'status' => 'returned',
        'payment_status' => 'unpaid',
        'payment_hold_expires_at' => null,
        'returned_at' => now()->subDays(8),
    ]);

    $response = postWebhook($this, paidEvent($booking->id, 'cs_late_2', (int) $booking->amount_due_centavos));

    $response->assertOk()->assertJsonFragment(['result' => 'refund_due']);
    expect($booking->fresh()->payment_status)->toBe(PaymentStatus::RefundDue);
});

test('a paid event inside a live hold still marks the booking paid', function () {
    $owner = User::factory()->create(['role' => 'parishioner', 'email_verified_at' => now()]);
    $booking = pendingBooking($owner, ['status' => 'submitted', 'payment_status' => 'unpaid', 'payment_hold_expires_at' => now()->addHours(10)]);

    $response = postWebhook($this, paidEvent($booking->id, 'cs_live_1', (int) $booking->amount_due_centavos));

    $response->assertOk()->assertJsonFragment(['result' => 'processed']);
    expect($booking->fresh()->payment_status)->toBe(PaymentStatus::Paid);
});
