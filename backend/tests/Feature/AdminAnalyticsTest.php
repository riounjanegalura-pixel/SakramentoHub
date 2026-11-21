<?php

use App\Models\Booking;
use App\Models\User;
use Database\Seeders\ServiceSeeder;

// Booking::factory() creates rows with real `sacrament` values, which is now
// a genuine FK onto `services.id` (see 2026_09_05_060000) — seed the real
// services so those inserts don't violate the constraint.
beforeEach(fn () => $this->seed(ServiceSeeder::class));

test('parishioner cannot view analytics', function () {
    $user = User::factory()->create(['role' => 'parishioner']);

    $this->actingAs($user)->getJson('/api/admin/analytics')->assertForbidden();
});

test('returns booking counts by status and sacrament plus recency counts', function () {
    $staff = User::factory()->create(['role' => 'staff']);

    Booking::factory()->create(['status' => 'submitted', 'sacrament' => 'baptism', 'created_at' => now()]);
    Booking::factory()->create(['status' => 'submitted', 'sacrament' => 'wedding', 'created_at' => now()]);
    Booking::factory()->create(['status' => 'completed', 'sacrament' => 'baptism', 'created_at' => now()->subDays(10)]);
    Booking::factory()->create(['status' => 'draft', 'sacrament' => 'funeral', 'created_at' => now()->subDays(40)]);

    $response = $this->actingAs($staff)->getJson('/api/admin/analytics');

    $response->assertOk();
    expect($response->json('byStatus.submitted'))->toBe(2);
    expect($response->json('byStatus.completed'))->toBe(1);
    expect($response->json('bySacrament.baptism'))->toBe(2);
    expect($response->json('createdLast7Days'))->toBe(2);
    expect($response->json('createdLast30Days'))->toBe(3);
});

test('lists visits for the next 14 days starting tomorrow, zero days included', function () {
    $staff = User::factory()->create(['role' => 'staff']);
    $tomorrow = \App\Support\ParishClock::today()->addDay();

    Booking::factory()->scheduled($tomorrow->toDateString(), '09:00', '10:00')->create(['status' => 'approved']);
    Booking::factory()->scheduled($tomorrow->toDateString(), '11:00', '12:00')->create(['status' => 'approved']);
    Booking::factory()->scheduled($tomorrow->addDays(13)->toDateString(), '09:00', '10:00')->create(['status' => 'approved']);
    // Outside the window, and a cancelled one: neither counts.
    Booking::factory()->scheduled($tomorrow->addDays(14)->toDateString(), '09:00', '10:00')->create(['status' => 'approved']);
    Booking::factory()->scheduled($tomorrow->toDateString(), '14:00', '15:00')->create(['status' => 'cancelled']);

    $ahead = $this->actingAs($staff)->getJson('/api/admin/analytics')->assertOk()->json('visitsAhead');

    expect($ahead)->toHaveCount(14);
    expect($ahead[0])->toBe(['date' => $tomorrow->toDateString(), 'count' => 2]);
    expect($ahead[1]['count'])->toBe(0);
    expect($ahead[13])->toBe(['date' => $tomorrow->addDays(13)->toDateString(), 'count' => 1]);
});

test('lists new bookings per day for the last 14 days ending today, drafts left out', function () {
    $staff = User::factory()->create(['role' => 'staff']);
    $today = \App\Support\ParishClock::today();

    Booking::factory()->create(['status' => 'submitted', 'created_at' => $today->addHours(10)]);
    Booking::factory()->create(['status' => 'submitted', 'created_at' => $today->addHours(11)]);
    Booking::factory()->create(['status' => 'submitted', 'created_at' => $today->subDays(13)->addHours(9)]);
    Booking::factory()->create(['status' => 'draft', 'created_at' => $today->addHours(9)]);
    Booking::factory()->create(['status' => 'submitted', 'created_at' => $today->subDays(14)->addHours(9)]);

    $days = $this->actingAs($staff)->getJson('/api/admin/analytics')->assertOk()->json('bookingsPerDay');

    expect($days)->toHaveCount(14);
    expect($days[0])->toBe(['date' => $today->subDays(13)->toDateString(), 'count' => 1]);
    expect($days[13])->toBe(['date' => $today->toDateString(), 'count' => 2]);
});

test('previews up to three waiting bookings', function () {
    $staff = User::factory()->create(['role' => 'staff']);

    $hold = Booking::factory()->create([
        'status' => 'submitted', 'payment_status' => 'unpaid', 'payment_hold_expires_at' => now()->addHours(2),
        'form_data' => ['childFirstName' => 'Santos', 'childLastName' => 'Family'],
    ]);
    $review = Booking::factory()->create(['status' => 'submitted', 'created_at' => now()->subDays(2), 'sacrament' => 'wedding']);
    $refund = Booking::factory()->create(['status' => 'cancelled', 'payment_status' => 'refund_due', 'amount_paid_centavos' => 50000, 'amount_refunded_centavos' => 0]);

    $json = $this->actingAs($staff)->getJson('/api/admin/analytics')->assertOk()->json();

    expect(collect($json['waitingPreview'])->pluck('kind')->all())->toBe(['hold', 'review', 'refund']);
    expect($json['waitingPreview'][0]['bookingId'])->toBe($hold->id);
    expect($json['waitingPreview'][0])->toHaveKey('holdExpiresAt');
    expect($json['waitingPreview'][1]['bookingId'])->toBe($review->id);
    expect($json['waitingPreview'][2]['refundCentavos'])->toBe(50000);
    expect($refund->id)->toBe($json['waitingPreview'][2]['bookingId']);

});

test('due soon lists the visits of today and the next two days, soonest first, and nothing later', function () {
    $staff = User::factory()->create(['role' => 'staff']);
    $today = \App\Support\ParishClock::today();
    $at = fn (int $days, string $start) => ['status' => 'approved', 'payment_status' => 'not_required', 'appointment_date' => $today->addDays($days)->toDateString(), 'appointment_start' => $start, 'appointment_end' => $start];

    $later = Booking::factory()->create($at(2, '09:00'));
    $soon = Booking::factory()->create($at(0, '15:00'));
    $tomorrow = Booking::factory()->create($at(1, '08:00'));
    Booking::factory()->create($at(3, '08:00'));
    Booking::factory()->create(['status' => 'completed'] + $at(1, '10:00'));

    $json = $this->actingAs($staff)->getJson('/api/admin/analytics')->assertOk()->json();

    expect(collect($json['dueSoon'])->pluck('bookingId')->all())->toBe([$soon->id, $tomorrow->id, $later->id]);
    expect($json['dueSoon'][0])->toHaveKeys(['subjectName', 'service', 'date', 'start', 'paymentStatus']);
    expect($json)->not->toHaveKey('recentActivity');
});
