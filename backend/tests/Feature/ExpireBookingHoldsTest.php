<?php

use App\Models\AppNotification;
use App\Models\Booking;
use Database\Seeders\ParishSettingSeeder;
use Database\Seeders\ServiceSeeder;

beforeEach(function () {
    $this->seed(ServiceSeeder::class);
    $this->seed(ParishSettingSeeder::class);
});

test('cancels unpaid bookings past their 48 hour hold and returned ones past 7 days', function () {
    $expiredUnpaid = Booking::factory()->create(['sacrament' => 'wedding', 'status' => 'submitted', 'payment_status' => 'unpaid', 'payment_hold_expires_at' => now()->subMinute()]);
    $liveUnpaid = Booking::factory()->create(['sacrament' => 'wedding', 'status' => 'submitted', 'payment_status' => 'unpaid', 'payment_hold_expires_at' => now()->addHour()]);
    $staleReturned = Booking::factory()->create(['sacrament' => 'funeral', 'status' => 'returned', 'returned_at' => now()->subDays(8)]);
    $freshReturned = Booking::factory()->create(['sacrament' => 'funeral', 'status' => 'returned', 'returned_at' => now()->subDays(2)]);

    $this->artisan('bookings:expire-holds')->assertSuccessful();

    expect($expiredUnpaid->fresh()->status->value)->toBe('cancelled')
        ->and($expiredUnpaid->fresh()->payment_status->value)->toBe('void')
        ->and($expiredUnpaid->fresh()->status_reason)->toStartWith('Payment not completed by ')
        ->and($liveUnpaid->fresh()->status->value)->toBe('submitted')
        ->and($staleReturned->fresh()->status->value)->toBe('cancelled')
        ->and($staleReturned->fresh()->status_reason)->toBe('Not resubmitted within 7 days.')
        ->and($freshReturned->fresh()->status->value)->toBe('returned')
        ->and(AppNotification::where('user_id', $expiredUnpaid->user_id)->where('title', 'Booking Cancelled')->exists())->toBeTrue();
});

test('the job is scheduled every fifteen minutes', function () {
    $this->artisan('schedule:list')->expectsOutputToContain('bookings:expire-holds');
});

test('does not cancel a booking that was selected as expired but became paid before expiry check', function () {
    $booking = Booking::factory()->create(['sacrament' => 'wedding', 'status' => 'submitted', 'payment_status' => 'paid', 'payment_hold_expires_at' => now()->subMinute()]);

    $this->artisan('bookings:expire-holds')->assertSuccessful();

    expect($booking->fresh()->status->value)->toBe('submitted')
        ->and($booking->fresh()->payment_status->value)->toBe('paid');
});

test('expireStaleHold returns false for a submitted booking whose hold is still in the future', function () {
    $booking = Booking::factory()->create(['sacrament' => 'wedding', 'status' => 'submitted', 'payment_status' => 'unpaid', 'payment_hold_expires_at' => now()->addHour()]);

    $result = app(\App\Services\Booking\BookingStateMachine::class)->expireStaleHold($booking);

    expect($result)->toBeFalse()
        ->and($booking->fresh()->status->value)->toBe('submitted');
});
