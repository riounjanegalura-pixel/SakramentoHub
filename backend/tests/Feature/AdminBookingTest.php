<?php

use App\Models\AppNotification;
use App\Models\AuditLog;
use App\Models\Booking;
use App\Models\User;
use Database\Seeders\ServiceSeeder;
use Illuminate\Support\Carbon;

// Booking::factory() creates rows with real `sacrament` values, which is now
// a genuine FK onto `services.id` (see 2026_09_05_060000) — seed the real
// services so those inserts don't violate the constraint.
beforeEach(fn () => $this->seed(ServiceSeeder::class));
afterEach(fn () => Carbon::setTestNow());

test('parishioner cannot list admin bookings', function () {
    $user = User::factory()->create(['role' => 'parishioner']);
    Booking::factory()->create(['status' => 'submitted', 'user_id' => $user->id]);

    $this->actingAs($user)->getJson('/api/admin/bookings')->assertForbidden();
});

test('staff lists every user\'s bookings, not just their own', function () {
    $staff = User::factory()->create(['role' => 'staff']);
    $userA = User::factory()->create();
    $userB = User::factory()->create();
    Booking::factory()->create(['status' => 'submitted', 'user_id' => $userA->id]);
    Booking::factory()->create(['status' => 'submitted', 'user_id' => $userB->id]);

    $response = $this->actingAs($staff)->getJson('/api/admin/bookings');

    $response->assertOk();
    expect($response->json('data'))->toHaveCount(2);
});

test('admin booking list includes the owning user\'s full name and email', function () {
    $staff = User::factory()->create(['role' => 'staff']);
    $owner = User::factory()->create(['full_name' => 'Juana Dela Cruz', 'email' => 'juana@example.com']);
    Booking::factory()->create(['status' => 'submitted', 'user_id' => $owner->id]);

    $response = $this->actingAs($staff)->getJson('/api/admin/bookings');

    $response->assertOk()
        ->assertJsonPath('data.0.user.fullName', 'Juana Dela Cruz')
        ->assertJsonPath('data.0.user.email', 'juana@example.com');
});

test('admin booking list is filterable by status and sacrament', function () {
    $staff = User::factory()->create(['role' => 'staff']);
    Booking::factory()->create(['status' => 'submitted', 'sacrament' => 'baptism']);
    Booking::factory()->create(['status' => 'draft', 'sacrament' => 'wedding']);

    $response = $this->actingAs($staff)->getJson('/api/admin/bookings?status=submitted&sacrament=baptism');

    $response->assertOk();
    expect($response->json('data'))->toHaveCount(1);
    expect($response->json('data.0.status'))->toBe('submitted');
});

test('search matches by full parishioner name', function () {
    $staff = User::factory()->create(['role' => 'staff']);
    $juana = User::factory()->create(['full_name' => 'Juana Dela Cruz']);
    $pedro = User::factory()->create(['full_name' => 'Pedro Reyes']);
    Booking::factory()->create(['status' => 'submitted', 'user_id' => $juana->id]);
    Booking::factory()->create(['status' => 'submitted', 'user_id' => $pedro->id]);

    $response = $this->actingAs($staff)->getJson('/api/admin/bookings?search=Juana Dela Cruz');

    $response->assertOk();
    expect($response->json('data'))->toHaveCount(1);
    expect($response->json('data.0.user.fullName'))->toBe('Juana Dela Cruz');
});

test('search matches by partial name, case-insensitively', function () {
    $staff = User::factory()->create(['role' => 'staff']);
    $juana = User::factory()->create(['full_name' => 'Juana Dela Cruz']);
    Booking::factory()->create(['status' => 'submitted', 'user_id' => $juana->id]);

    $response = $this->actingAs($staff)->getJson('/api/admin/bookings?search=juana');

    expect($response->json('data'))->toHaveCount(1);
});

test('search matches by email', function () {
    $staff = User::factory()->create(['role' => 'staff']);
    $owner = User::factory()->create(['email' => 'juana@example.com']);
    $other = User::factory()->create(['email' => 'pedro@example.com']);
    Booking::factory()->create(['status' => 'submitted', 'user_id' => $owner->id]);
    Booking::factory()->create(['status' => 'submitted', 'user_id' => $other->id]);

    $response = $this->actingAs($staff)->getJson('/api/admin/bookings?search=juana@example.com');

    expect($response->json('data'))->toHaveCount(1);
    expect($response->json('data.0.user.email'))->toBe('juana@example.com');
});

test('search matches by full or partial reference number', function () {
    $staff = User::factory()->create(['role' => 'staff']);
    $match = Booking::factory()->create(['status' => 'submitted']);
    Booking::factory()->create(['status' => 'submitted']);

    $response = $this->actingAs($staff)->getJson('/api/admin/bookings?search='.$match->reference_number);
    expect($response->json('data'))->toHaveCount(1);
    expect($response->json('data.0.id'))->toBe($match->id);

    $partial = substr($match->reference_number, 0, 6);
    $response2 = $this->actingAs($staff)->getJson('/api/admin/bookings?search='.$partial);
    expect(collect($response2->json('data'))->pluck('id'))->toContain($match->id);
});

test('empty search returns everything', function () {
    $staff = User::factory()->create(['role' => 'staff']);
    Booking::factory()->count(3)->create(['status' => 'submitted']);

    // Laravel's global ConvertEmptyStringsToNull middleware turns `?search=`
    // into a present-but-null field, which the request never actually sends
    // over the wire in practice — the real frontend (admin's fetchBookings)
    // omits the `search` param entirely once the field is cleared, which is
    // what this test exercises: no `search` key in the query at all.
    $response = $this->actingAs($staff)->getJson('/api/admin/bookings');

    expect($response->json('data'))->toHaveCount(3);
});

test('search combined with a status filter narrows correctly', function () {
    $staff = User::factory()->create(['role' => 'staff']);
    $owner = User::factory()->create(['full_name' => 'Juana Dela Cruz']);
    Booking::factory()->create(['user_id' => $owner->id, 'status' => 'submitted']);
    Booking::factory()->create(['user_id' => $owner->id, 'status' => 'draft']);

    $response = $this->actingAs($staff)->getJson('/api/admin/bookings?search=Juana&status=submitted');

    expect($response->json('data'))->toHaveCount(1);
    expect($response->json('data.0.status'))->toBe('submitted');
});

test('search still finds a booking by name/email after its owner account was hard-deleted (item 29)', function () {
    $staff = User::factory()->create(['role' => 'staff']);
    $owner = User::factory()->create(['full_name' => 'Juana Dela Cruz', 'email' => 'juana@example.com']);
    $booking = Booking::factory()->create(['status' => 'submitted', 'user_id' => $owner->id]);

    // Mirrors AccountController::destroy: snapshot the owner into
    // owner_snapshot, then sever user_id the same way a real self-service
    // deletion does (nullOnDelete), rather than asserting against a
    // hand-built row shape the controller doesn't actually produce.
    $booking->update(['owner_snapshot' => ['fullName' => $owner->full_name, 'email' => $owner->email]]);
    $owner->delete();
    $booking->refresh();
    expect($booking->user_id)->toBeNull();

    $byName = $this->actingAs($staff)->getJson('/api/admin/bookings?search=Juana Dela Cruz');
    expect($byName->json('data'))->toHaveCount(1);
    expect($byName->json('data.0.id'))->toBe($booking->id);

    $byEmail = $this->actingAs($staff)->getJson('/api/admin/bookings?search=juana@example.com');
    expect($byEmail->json('data'))->toHaveCount(1);
    expect($byEmail->json('data.0.id'))->toBe($booking->id);
});

test('search with no matches returns an empty paginated response, not an error', function () {
    $staff = User::factory()->create(['role' => 'staff']);
    Booking::factory()->create(['status' => 'submitted']);

    $response = $this->actingAs($staff)->getJson('/api/admin/bookings?search=nobody-has-this-name-xyz');

    $response->assertOk();
    expect($response->json('data'))->toHaveCount(0);
    expect($response->json('meta.total'))->toBe(0);
});

test('every booking gets a unique, human-readable reference number', function () {
    $booking = Booking::factory()->create(['status' => 'submitted', 'sacrament' => 'baptism']);

    expect($booking->reference_number)->not->toBeNull();
    expect($booking->reference_number)->toStartWith('BAPT-');
});

test('staff can view a single booking\'s full detail', function () {
    $staff = User::factory()->create(['role' => 'staff']);
    $booking = Booking::factory()->create(['status' => 'submitted']);

    $this->actingAs($staff)->getJson("/api/admin/bookings/{$booking->id}")
        ->assertOk()
        ->assertJsonPath('id', $booking->id);
});

test('approves a submitted booking and writes an audit row', function () {
    $admin = User::factory()->create(['role' => 'admin']);
    $booking = Booking::factory()->create(['status' => 'submitted']);

    $response = $this->actingAs($admin)->patchJson("/api/admin/bookings/{$booking->id}/approve");

    $response->assertOk()->assertJsonPath('status', 'approved');

    $log = AuditLog::first();
    expect($log)->not->toBeNull();
    expect($log->actor_user_id)->toBe($admin->id);
    expect($log->action)->toBe('booking.approved');
    expect($log->subject_id)->toBe($booking->id);
    expect($log->metadata)->toMatchArray([
        'from' => 'submitted',
        'actorName' => $admin->full_name,
        'actorEmail' => $admin->email,
    ]);

    $notification = AppNotification::where('user_id', $booking->user_id)->first();
    expect($notification)->not->toBeNull();
    expect($notification->title)->toBe('Booking Approved');
    expect($notification->read)->toBeFalse();
});

test('audit row survives the actor user being deleted, with the name preserved', function () {
    $admin = User::factory()->create(['role' => 'admin']);
    $booking = Booking::factory()->create(['status' => 'submitted']);

    $this->actingAs($admin)->patchJson("/api/admin/bookings/{$booking->id}/approve")->assertOk();
    $log = AuditLog::first();

    $admin->delete();
    $log->refresh();

    // nullOnDelete, not cascadeOnDelete: the row survives.
    expect(AuditLog::find($log->id))->not->toBeNull();
    expect($log->actor_user_id)->toBeNull();
    // ...and the name is still there, because it was denormalized at write time.
    expect($log->metadata['actorName'])->not->toBeNull();
});

test('cannot approve a booking that is not submitted', function () {
    $admin = User::factory()->create(['role' => 'admin']);
    $booking = Booking::factory()->create(['status' => 'draft']);

    $this->actingAs($admin)->patchJson("/api/admin/bookings/{$booking->id}/approve")
        ->assertUnprocessable();

    expect($booking->fresh()->status->value)->toBe('draft');
});

test('parishioner cannot approve a booking', function () {
    $user = User::factory()->create(['role' => 'parishioner']);
    $booking = Booking::factory()->create(['status' => 'submitted']);

    $this->actingAs($user)->patchJson("/api/admin/bookings/{$booking->id}/approve")->assertForbidden();
});

test('declines a submitted booking with a reason and writes an audit row', function () {
    $staff = User::factory()->create(['role' => 'staff']);
    $booking = Booking::factory()->create(['status' => 'submitted']);

    $response = $this->actingAs($staff)->patchJson("/api/admin/bookings/{$booking->id}/decline", [
        'reason' => 'Missing baptismal certificate',
    ]);

    $response->assertOk()
        ->assertJsonPath('status', 'declined')
        ->assertJsonPath('statusReason', 'Missing baptismal certificate');

    $log = AuditLog::first();
    expect($log->action)->toBe('booking.declined');
    expect($log->metadata['reason'])->toBe('Missing baptismal certificate');

    $notification = AppNotification::where('user_id', $booking->user_id)->first();
    expect($notification->title)->toBe('Booking Declined');
    expect($notification->body)->toContain('Missing baptismal certificate');
});

test('declining requires a reason', function () {
    $staff = User::factory()->create(['role' => 'staff']);
    $booking = Booking::factory()->create(['status' => 'submitted']);

    $this->actingAs($staff)->patchJson("/api/admin/bookings/{$booking->id}/decline", [])
        ->assertUnprocessable();
});

test('cannot decline a booking that is not submitted', function () {
    $staff = User::factory()->create(['role' => 'staff']);
    $booking = Booking::factory()->create(['status' => 'approved']);

    $this->actingAs($staff)->patchJson("/api/admin/bookings/{$booking->id}/decline", ['reason' => 'x'])
        ->assertUnprocessable();
});

test('completes an approved booking and writes an audit row', function () {
    $staff = User::factory()->create(['role' => 'staff']);
    Carbon::setTestNow(Carbon::parse('2026-11-02 00:00:00', 'UTC'));
    $booking = Booking::factory()->scheduled('2026-11-01', '10:00', '11:00')->create(['status' => 'approved']);

    $response = $this->actingAs($staff)->patchJson("/api/admin/bookings/{$booking->id}/complete");

    $response->assertOk()->assertJsonPath('status', 'completed');

    $log = AuditLog::first();
    expect($log->action)->toBe('booking.completed');

    $notification = AppNotification::where('user_id', $booking->user_id)->first();
    expect($notification->title)->toBe('Sacrament recorded');
});

test('cannot complete a booking that is not approved', function () {
    $staff = User::factory()->create(['role' => 'staff']);
    $booking = Booking::factory()->create(['status' => 'submitted']);

    $this->actingAs($staff)->patchJson("/api/admin/bookings/{$booking->id}/complete")
        ->assertUnprocessable();
});

test('priority ordering puts funeral bookings first, then earliest appointmentDate', function () {
    $staff = User::factory()->create(['role' => 'staff']);

    $weddingLate = Booking::factory()->scheduled('2026-12-01', '10:00', '11:00')->create([
        'status' => 'submitted', 'sacrament' => 'wedding',
    ]);
    $funeral = Booking::factory()->scheduled('2026-12-25', '10:00', '11:00')->create([
        'status' => 'submitted', 'sacrament' => 'funeral',
    ]);
    $baptismEarly = Booking::factory()->scheduled('2026-09-05', '10:00', '11:00')->create([
        'status' => 'submitted', 'sacrament' => 'baptism',
    ]);
    $noDate = Booking::factory()->create([
        'status' => 'submitted', 'sacrament' => 'confirmation',
    ]);

    $response = $this->actingAs($staff)->getJson('/api/admin/bookings?status=submitted&priority=1');

    $ids = collect($response->json('data'))->pluck('id')->all();

    expect($ids)->toBe([$funeral->id, $baptismEarly->id, $weddingLate->id, $noDate->id]);
});

test('priority ordering includes anointing, not just funeral', function () {
    $staff = User::factory()->create(['role' => 'staff']);

    $wedding = Booking::factory()->scheduled('2026-09-05', '10:00', '11:00')->create([
        'status' => 'submitted', 'sacrament' => 'wedding',
    ]);
    $anointing = Booking::factory()->scheduled('2026-12-25', '10:00', '11:00')->create([
        'status' => 'submitted', 'sacrament' => 'anointing',
    ]);

    $response = $this->actingAs($staff)->getJson('/api/admin/bookings?status=submitted&priority=1');

    $ids = collect($response->json('data'))->pluck('id')->all();

    expect($ids)->toBe([$anointing->id, $wedding->id]);
});

test('booking list flags funeral and anointing as isPriority, nothing else', function () {
    $staff = User::factory()->create(['role' => 'staff']);
    Booking::factory()->create(['status' => 'submitted', 'sacrament' => 'funeral']);
    Booking::factory()->create(['status' => 'submitted', 'sacrament' => 'anointing']);
    Booking::factory()->create(['status' => 'submitted', 'sacrament' => 'wedding']);

    $response = $this->actingAs($staff)->getJson('/api/admin/bookings');

    $flags = collect($response->json('data'))->pluck('isPriority', 'sacrament');

    expect($flags['funeral'])->toBeTrue();
    expect($flags['anointing'])->toBeTrue();
    expect($flags['wedding'])->toBeFalse();
});

test('parishioner cannot read admin booking counts', function () {
    $user = User::factory()->create(['role' => 'parishioner']);

    $this->actingAs($user)->getJson('/api/admin/bookings/counts')->assertForbidden();
});

test('booking counts are grouped per sacrament, zero-filled for empty categories', function () {
    $staff = User::factory()->create(['role' => 'staff']);
    Booking::factory()->count(2)->create(['status' => 'submitted', 'sacrament' => 'baptism']);
    Booking::factory()->create(['status' => 'submitted', 'sacrament' => 'wedding']);

    $response = $this->actingAs($staff)->getJson('/api/admin/bookings/counts');

    $response->assertOk()
        ->assertJsonPath('total', 3)
        ->assertJsonPath('bySacrament.baptism', 2)
        ->assertJsonPath('bySacrament.wedding', 1)
        ->assertJsonPath('bySacrament.funeral', 0)
        ->assertJsonPath('bySacrament.house-blessing', 0);
    expect($response->json('bySacrament'))->toHaveCount(6);
});

test('booking counts honor the status and search filters but ignore sacrament', function () {
    $staff = User::factory()->create(['role' => 'staff']);
    $juana = User::factory()->create(['full_name' => 'Juana Dela Cruz']);
    $pedro = User::factory()->create(['full_name' => 'Pedro Reyes']);
    Booking::factory()->create(['user_id' => $juana->id, 'status' => 'submitted', 'sacrament' => 'baptism']);
    Booking::factory()->create(['user_id' => $juana->id, 'status' => 'submitted', 'sacrament' => 'wedding']);
    Booking::factory()->create(['user_id' => $juana->id, 'status' => 'approved', 'sacrament' => 'baptism']);
    Booking::factory()->create(['user_id' => $pedro->id, 'status' => 'submitted', 'sacrament' => 'baptism']);

    $response = $this->actingAs($staff)
        ->getJson('/api/admin/bookings/counts?status=submitted&search=juana&sacrament=wedding');

    $response->assertOk()
        ->assertJsonPath('total', 2)
        ->assertJsonPath('bySacrament.baptism', 1)
        ->assertJsonPath('bySacrament.wedding', 1);
});

test('the counts route is not swallowed by the booking detail route', function () {
    $staff = User::factory()->create(['role' => 'staff']);

    $this->actingAs($staff)->getJson('/api/admin/bookings/counts')
        ->assertOk()
        ->assertJsonStructure(['total', 'bySacrament']);
});

test('the default queue and its counts leave out unsubmitted parishioner drafts', function () {
    $staff = User::factory()->create(['role' => 'staff']);
    Booking::factory()->create(['status' => 'draft', 'sacrament' => 'wedding']);
    Booking::factory()->create(['status' => 'submitted', 'sacrament' => 'baptism']);

    $list = $this->actingAs($staff)->getJson('/api/admin/bookings')->assertOk();
    expect($list->json('data'))->toHaveCount(1)->and($list->json('data.0.status'))->toBe('submitted');

    $this->actingAs($staff)->getJson('/api/admin/bookings?priority=1')->assertOk()->assertJsonCount(1, 'data');

    $this->actingAs($staff)->getJson('/api/admin/bookings/counts')->assertOk()
        ->assertJsonPath('total', 1)
        ->assertJsonPath('bySacrament.wedding', 0)
        ->assertJsonPath('bySacrament.baptism', 1);
});

test('drafts stay reachable through the explicit status filter', function () {
    $staff = User::factory()->create(['role' => 'staff']);
    Booking::factory()->create(['status' => 'draft', 'sacrament' => 'wedding']);

    $this->actingAs($staff)->getJson('/api/admin/bookings?status=draft')->assertOk()->assertJsonCount(1, 'data');
    $this->actingAs($staff)->getJson('/api/admin/bookings/counts?status=draft')->assertOk()->assertJsonPath('total', 1);
});

test('search finds Ñ and accented names whatever case is typed', function () {
    $staff = User::factory()->create(['role' => 'staff']);
    $nino = User::factory()->create(['full_name' => 'Ñiguez Dela Peña']);
    $other = User::factory()->create(['full_name' => 'Pedro Reyes']);
    Booking::factory()->create(['status' => 'submitted', 'user_id' => $nino->id]);
    Booking::factory()->create(['status' => 'submitted', 'user_id' => $other->id]);

    foreach (['ÑIGUEZ', 'ñiguez', 'Ñiguez', 'PEÑA', 'peña'] as $term) {
        $res = $this->actingAs($staff)->getJson('/api/admin/bookings?search='.urlencode($term));
        expect($res->json('data'))->toHaveCount(1, "term {$term}");
    }
});

test('search finds a walk-in owner stored only in the snapshot, with accents', function () {
    $staff = User::factory()->create(['role' => 'staff']);
    Booking::factory()->create(['status' => 'submitted', 'user_id' => null, 'owner_snapshot' => ['fullName' => 'Ñora Santos', 'email' => 'nora@example.org']]);

    foreach (['ñora', 'ÑORA', 'Ñora'] as $term) {
        $res = $this->actingAs($staff)->getJson('/api/admin/bookings?search='.urlencode($term));
        expect($res->json('data'))->toHaveCount(1, "term {$term}");
    }
});

test('search still treats percent and underscore literally', function () {
    $staff = User::factory()->create(['role' => 'staff']);
    $u = User::factory()->create(['full_name' => 'Maria Cruz']);
    Booking::factory()->create(['status' => 'submitted', 'user_id' => $u->id]);

    expect($this->actingAs($staff)->getJson('/api/admin/bookings?search='.urlencode('M%'))->json('data'))->toHaveCount(0);
    expect($this->actingAs($staff)->getJson('/api/admin/bookings?search='.urlencode('Mar_a'))->json('data'))->toHaveCount(0);
});

test('the queue filters take comma-separated lists for status, sacrament, payment and channel', function () {
    $staff = User::factory()->create(['role' => 'staff']);
    Booking::factory()->create(['status' => 'submitted', 'sacrament' => 'baptism', 'payment_status' => 'paid']);
    Booking::factory()->create(['status' => 'approved', 'sacrament' => 'wedding', 'payment_status' => 'unpaid']);
    Booking::factory()->create(['status' => 'completed', 'sacrament' => 'wedding', 'payment_status' => 'paid']);

    $this->actingAs($staff)->getJson('/api/admin/bookings?status=submitted,approved')
        ->assertOk()->assertJsonCount(2, 'data');
    $this->actingAs($staff)->getJson('/api/admin/bookings?sacrament=baptism,wedding&paymentStatus=paid,refund_due')
        ->assertOk()->assertJsonCount(2, 'data');
    $this->actingAs($staff)->getJson('/api/admin/bookings/counts?status=approved,completed')
        ->assertOk()->assertJsonPath('total', 2)->assertJsonPath('bySacrament.wedding', 2);
});

test('a list filter with an unknown value is refused', function () {
    $staff = User::factory()->create(['role' => 'staff']);

    $this->actingAs($staff)->getJson('/api/admin/bookings?status=submitted,nonsense')->assertStatus(422);
    $this->actingAs($staff)->getJson('/api/admin/bookings?channel=carrier_pigeon')->assertStatus(422);
});
