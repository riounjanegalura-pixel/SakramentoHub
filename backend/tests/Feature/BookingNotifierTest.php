<?php

use App\Models\AppNotification;
use App\Models\AuditLog;
use App\Models\Booking;
use App\Models\User;
use App\Services\Booking\BookingAudit;
use App\Services\Booking\BookingNotifier;
use Database\Seeders\ServiceSeeder;

beforeEach(fn () => $this->seed(ServiceSeeder::class));

test('owner notification is skipped when the owner account was deleted', function () {
    $booking = Booking::factory()->create(['user_id' => null, 'sacrament' => 'funeral']);

    app(BookingNotifier::class)->owner($booking, 'Approved', 'Body');

    expect(AppNotification::count())->toBe(0);
});

test('owner notification is written for an existing owner', function () {
    $booking = Booking::factory()->create();

    app(BookingNotifier::class)->owner($booking, 'Approved', 'Body');

    expect(AppNotification::where('user_id', $booking->user_id)->count())->toBe(1);
});

test('staff notification fans out to active staff and admins only', function () {
    User::factory()->create(['role' => 'staff']);
    User::factory()->create(['role' => 'admin']);
    User::factory()->create(['role' => 'staff', 'is_active' => false]);
    User::factory()->create(['role' => 'parishioner']);

    app(BookingNotifier::class)->staff('Refund due', 'Body');

    expect(AppNotification::count())->toBe(2);
});

test('audit record with no actor is attributed to System', function () {
    $booking = Booking::factory()->create();

    app(BookingAudit::class)->record(null, 'booking.cancelled', $booking, ['reason' => 'x']);

    $row = AuditLog::first();
    expect($row->actor_user_id)->toBeNull()
        ->and($row->metadata['actorName'])->toBe('System')
        ->and($row->metadata['reason'])->toBe('x');
});

test('sacrament label is the service name', function () {
    $booking = Booking::factory()->create(['sacrament' => 'funeral']);
    expect(app(BookingNotifier::class)->sacramentLabel($booking))->toBe('Funeral Mass');
});
