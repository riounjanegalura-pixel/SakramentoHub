<?php

use App\Models\AuditLog;
use App\Models\Booking;
use App\Models\User;
use Database\Seeders\ServiceSeeder;

// Booking::factory() creates rows with real `sacrament` values, which is now
// a genuine FK onto `services.id` (see 2026_09_05_060000) — seed the real
// services so those inserts don't violate the constraint.
beforeEach(fn () => $this->seed(ServiceSeeder::class));

test('parishioner cannot view the audit log', function () {
    $user = User::factory()->create(['role' => 'parishioner']);

    $this->actingAs($user)->getJson('/api/admin/audit-log')->assertForbidden();
});

test('lists audit log entries newest first with actor info', function () {
    $admin = User::factory()->create(['role' => 'admin', 'full_name' => 'Father Jun', 'email' => 'jun@example.com']);
    $booking = Booking::factory()->create();

    AuditLog::create([
        'actor_user_id' => $admin->id,
        'action' => 'booking.approved',
        'subject_type' => 'booking',
        'subject_id' => $booking->id,
        'metadata' => ['from' => 'submitted', 'to' => 'approved'],
        'created_at' => now()->subMinute(),
    ]);
    AuditLog::create([
        'actor_user_id' => $admin->id,
        'action' => 'booking.completed',
        'subject_type' => 'booking',
        'subject_id' => $booking->id,
        'metadata' => ['from' => 'approved', 'to' => 'completed'],
        'created_at' => now(),
    ]);

    $response = $this->actingAs($admin)->getJson('/api/admin/audit-log');

    $response->assertOk();
    expect($response->json('data.0.action'))->toBe('booking.completed');
    expect($response->json('data.1.action'))->toBe('booking.approved');
    expect($response->json('data.0.actor.fullName'))->toBe('Father Jun');
    expect($response->json('data.0.actor.email'))->toBe('jun@example.com');
});

test('falls back to the denormalized actor name/email when the actor user no longer exists', function () {
    $viewer = User::factory()->create(['role' => 'admin']);
    $deletedActor = User::factory()->create(['full_name' => 'Sister Mary', 'email' => 'mary@example.com']);
    $booking = Booking::factory()->create();

    AuditLog::create([
        'actor_user_id' => $deletedActor->id,
        'action' => 'booking.approved',
        'subject_type' => 'booking',
        'subject_id' => $booking->id,
        'metadata' => ['from' => 'submitted', 'to' => 'approved', 'actorName' => 'Sister Mary', 'actorEmail' => 'mary@example.com'],
        'created_at' => now(),
    ]);
    $deletedActor->delete();

    $response = $this->actingAs($viewer)->getJson('/api/admin/audit-log');

    $response->assertOk();
    expect($response->json('data.0.actor.id'))->toBeNull();
    expect($response->json('data.0.actor.fullName'))->toBe('Sister Mary');
    expect($response->json('data.0.actor.email'))->toBe('mary@example.com');
});

function seedAuditRows(): User
{
    $admin = User::factory()->create(['role' => 'admin', 'full_name' => 'Father Jun', 'email' => 'jun@example.com']);
    $other = User::factory()->create(['role' => 'staff', 'full_name' => 'Sister Mary', 'email' => 'mary@example.com']);
    AuditLog::create(['actor_user_id' => $admin->id, 'action' => 'booking.approved', 'subject_type' => 'booking', 'subject_id' => 'sub-aaa', 'metadata' => [], 'created_at' => '2026-03-01 04:00:00']);
    AuditLog::create(['actor_user_id' => $other->id, 'action' => 'register.revoked', 'subject_type' => 'register_entry', 'subject_id' => 'sub-bbb', 'metadata' => [], 'created_at' => '2026-03-10 04:00:00']);
    AuditLog::create(['actor_user_id' => $admin->id, 'action' => 'settings.parish_updated', 'subject_type' => 'settings', 'subject_id' => 'sub-ccc', 'metadata' => [], 'created_at' => '2026-03-20 04:00:00']);

    return $admin;
}

test('filters by area', function () {
    $admin = seedAuditRows();
    $r = $this->actingAs($admin)->getJson('/api/admin/audit-log?area=register');
    $r->assertOk();
    expect(collect($r->json('data'))->pluck('action')->all())->toBe(['register.revoked']);
});

test('searches action, actor name, email and subject id', function () {
    $admin = seedAuditRows();
    $by = fn ($q) => collect($this->actingAs($admin)->getJson('/api/admin/audit-log?q='.urlencode($q))->json('data'))->pluck('action')->all();
    expect($by('mary'))->toBe(['register.revoked']);
    expect($by('jun@example'))->toBe(['settings.parish_updated', 'booking.approved']);
    expect($by('sub-ccc'))->toBe(['settings.parish_updated']);
    expect($by('booking.appr'))->toBe(['booking.approved']);
    expect($by('zzz'))->toBe([]);
});

test('filters by an inclusive parish-local date range', function () {
    $admin = seedAuditRows();
    $r = $this->actingAs($admin)->getJson('/api/admin/audit-log?from=2026-03-10&to=2026-03-10');
    expect(collect($r->json('data'))->pluck('action')->all())->toBe(['register.revoked']);
    $r = $this->actingAs($admin)->getJson('/api/admin/audit-log?from=2026-03-11');
    expect(collect($r->json('data'))->pluck('action')->all())->toBe(['settings.parish_updated']);
});

test('combines filters and rejects bad input', function () {
    $admin = seedAuditRows();
    $r = $this->actingAs($admin)->getJson('/api/admin/audit-log?area=booking&q=jun&from=2026-03-01&to=2026-03-05');
    expect(collect($r->json('data'))->pluck('action')->all())->toBe(['booking.approved']);
    $this->actingAs($admin)->getJson('/api/admin/audit-log?from=yesterday')->assertUnprocessable();
    $this->actingAs($admin)->getJson('/api/admin/audit-log?area=a.b')->assertUnprocessable();
});

test('the summary lists the last 14 days, counts per day and the busiest people', function () {
    $admin = User::factory()->create(['role' => 'admin', 'full_name' => 'Father Jun']);

    foreach ([now(), now(), now()->subDays(2)] as $at) {
        AuditLog::create(['actor_user_id' => $admin->id, 'action' => 'settings.parish_updated', 'subject_type' => 'settings', 'subject_id' => 'x', 'metadata' => [], 'created_at' => $at]);
    }
    AuditLog::create(['actor_user_id' => null, 'action' => 'certificate_requests.files_pruned', 'subject_type' => 'system', 'subject_id' => 'x', 'metadata' => [], 'created_at' => now()]);
    AuditLog::create(['actor_user_id' => $admin->id, 'action' => 'settings.parish_updated', 'subject_type' => 'settings', 'subject_id' => 'x', 'metadata' => [], 'created_at' => now()->subDays(40)]);

    $json = $this->actingAs($admin)->getJson('/api/admin/audit-log/summary')->assertOk()->json();

    expect($json['days'])->toHaveCount(14)
        ->and($json['total'])->toBe(4)
        ->and(collect($json['days'])->last()['count'])->toBe(3)
        ->and($json['people'][0])->toBe(['name' => 'Father Jun', 'count' => 3])
        ->and($json['people'][1])->toBe(['name' => 'System', 'count' => 1]);
});

test('a parishioner cannot read the audit summary', function () {
    $user = User::factory()->create(['role' => 'parishioner']);

    $this->actingAs($user)->getJson('/api/admin/audit-log/summary')->assertForbidden();
});
