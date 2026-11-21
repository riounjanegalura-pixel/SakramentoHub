<?php

use App\Models\Booking;
use Illuminate\Support\Carbon;

beforeEach(fn () => $this->seed(\Database\Seeders\ServiceSeeder::class));
afterEach(fn () => Carbon::setTestNow());

// Found in a browser run: a booking made at 7:20 AM in Manila carried the previous day's date.
test('a reference number carries the parish date, not the UTC date', function () {
    Carbon::setTestNow(Carbon::parse('2026-11-02 23:30:00', 'UTC')); // Tue 3 Nov, 07:30 Manila

    $user = \App\Models\User::factory()->create();
    $booking = Booking::factory()->create(['user_id' => $user->id, 'sacrament' => 'baptism']);

    expect($booking->reference_number)->toStartWith('BAPT-20261103-');
});

test('a reference number made from a stored UTC timestamp uses that moment\'s parish date', function () {
    expect(Booking::generateReferenceNumber('wedding', Carbon::parse('2026-11-02 16:30:00', 'UTC')))->toStartWith('WEDD-20261103-');
});
