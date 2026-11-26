<?php

use App\Models\AuditLog;
use App\Models\Booking;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

beforeEach(function () {
    $this->seed(\Database\Seeders\ServiceSeeder::class);
    $this->seed(\Database\Seeders\ParishSettingSeeder::class);
    \Illuminate\Support\Carbon::setTestNow(\Illuminate\Support\Carbon::parse('2026-11-02 00:00:00', 'UTC')); // Mon 08:00 Manila
    \Illuminate\Support\Facades\Storage::fake('local');
    $this->staff = \App\Models\User::factory()->create(['role' => 'staff']);
    $this->admin = \App\Models\User::factory()->create(['role' => 'admin']);
});
afterEach(fn () => \Illuminate\Support\Carbon::setTestNow());

function approvedBlessing(User $owner, string $date = '2026-11-10'): Booking
{
    return Booking::factory()->scheduled($date, '10:00', '10:45')->create([
        'user_id' => $owner->id, 'sacrament' => 'house-blessing', 'status' => 'approved', 'payment_status' => 'not_required',
        'is_offsite' => true, 'form_data' => ['propertyType' => 'house', 'propertyOwner' => 'A'],
    ]);
}

test('staff move an approved booking and it stays approved', function () {
    $owner = User::factory()->create();
    $b = approvedBlessing($owner);
    $this->actingAs($this->staff)->patchJson("/api/admin/bookings/{$b->id}/reschedule", [
        'appointmentDate' => '2026-11-12', 'appointmentStart' => '14:30', 'reason' => 'Family asked by phone',
    ])->assertOk()->assertJsonPath('status', 'approved')->assertJsonPath('appointmentDate', '2026-11-12')
        ->assertJsonPath('appointmentStart', '14:30')->assertJsonPath('appointmentEnd', '15:15');

    $meta = AuditLog::where('action', 'booking.rescheduled_by_staff')->where('subject_id', $b->id)->first()->metadata;
    expect($meta['fromDate'])->toBe('2026-11-10')->and($meta['reason'])->toBe('Family asked by phone')->and($meta['leadTimeWaived'])->toBeFalse();
    expect(\App\Models\AppNotification::where('user_id', $owner->id)->where('title', 'Booking Rescheduled')->exists())->toBeTrue();
});

test('the parishioner is told the new date and the reason when staff reschedule', function () {
    $owner = User::factory()->create();
    $b = approvedBlessing($owner);
    $this->actingAs($this->staff)->patchJson("/api/admin/bookings/{$b->id}/reschedule", [
        'appointmentDate' => '2026-11-12', 'appointmentStart' => '14:30', 'reason' => 'Parish schedule conflict',
    ])->assertOk();

    $note = \App\Models\AppNotification::where('user_id', $owner->id)->where('title', 'Booking Rescheduled')->firstOrFail();
    expect($note->booking_id)->toBe($b->id)->and($note->body)->toContain('2026-11-12')->toContain('14:30')->toContain('Parish schedule conflict');
});

test('a reason is required', function () {
    $b = approvedBlessing(User::factory()->create());
    $this->actingAs($this->staff)->patchJson("/api/admin/bookings/{$b->id}/reschedule", ['appointmentDate' => '2026-11-12', 'appointmentStart' => '14:30'])->assertUnprocessable();
});

test('staff cannot double-book the priest', function () {
    $owner = User::factory()->create();
    Booking::factory()->scheduled('2026-11-12', '14:00', '15:00')->create(['sacrament' => 'funeral', 'status' => 'approved', 'payment_status' => 'not_required']);
    $b = approvedBlessing($owner);
    $this->actingAs($this->staff)->patchJson("/api/admin/bookings/{$b->id}/reschedule", [
        'appointmentDate' => '2026-11-12', 'appointmentStart' => '14:30', 'reason' => 'x',
    ])->assertUnprocessable()->assertJsonPath('message', 'That time is no longer available. Please choose another.');
});

test('lead time blocks staff unless waived, and the waiver is audited', function () {
    $b = approvedBlessing(User::factory()->create()); // house blessing: 3-day lead time
    $payload = ['appointmentDate' => '2026-11-03', 'appointmentStart' => '10:15', 'reason' => 'Urgent move-in'];
    $this->actingAs($this->staff)->patchJson("/api/admin/bookings/{$b->id}/reschedule", $payload)->assertUnprocessable();
    $this->actingAs($this->staff)->patchJson("/api/admin/bookings/{$b->id}/reschedule", $payload + ['waiveLeadTime' => true])->assertOk();
    expect(AuditLog::where('action', 'booking.rescheduled_by_staff')->latest('created_at')->first()->metadata['leadTimeWaived'])->toBeTrue();
});

test('a waiver never overrides a blackout', function () {
    \App\Models\BlackoutDate::create(['date' => '2026-11-04', 'reason' => 'Parish fiesta', 'sacraments' => null]);
    $b = approvedBlessing(User::factory()->create());
    $this->actingAs($this->staff)->patchJson("/api/admin/bookings/{$b->id}/reschedule", [
        'appointmentDate' => '2026-11-04', 'appointmentStart' => '10:00', 'reason' => 'x', 'waiveLeadTime' => true,
    ])->assertUnprocessable()->assertJsonPath('message', 'Unavailable: Parish fiesta.');
});

test('completed, declined and cancelled bookings cannot be rescheduled by staff', function (string $status) {
    $b = approvedBlessing(User::factory()->create());
    $b->update(['status' => $status]);
    $this->actingAs($this->staff)->patchJson("/api/admin/bookings/{$b->id}/reschedule", [
        'appointmentDate' => '2026-11-12', 'appointmentStart' => '14:30', 'reason' => 'x',
    ])->assertUnprocessable();
})->with(['completed', 'declined', 'cancelled', 'draft', 'returned']);

test('a parishioner cannot reschedule an approved booking inside the 3-day cut-off', function () {
    $owner = User::factory()->create();
    $b = approvedBlessing($owner, '2026-11-04'); // 2 days away
    $this->actingAs($owner)->patchJson("/api/bookings/{$b->id}/reschedule", ['appointmentDate' => '2026-11-12', 'appointmentStart' => '10:15'])
        ->assertUnprocessable()->assertJsonPath('message', 'Approved bookings can only be rescheduled online until 3 days before the appointment. Please call the parish office at 09123456789.');
});

test('a parishioner can still reschedule an approved booking exactly 3 days out, and any submitted one', function () {
    $owner = User::factory()->create();
    $onTheLine = approvedBlessing($owner, '2026-11-05');
    $this->actingAs($owner)->patchJson("/api/bookings/{$onTheLine->id}/reschedule", ['appointmentDate' => '2026-11-12', 'appointmentStart' => '10:15'])->assertOk();

    $submitted = approvedBlessing($owner, '2026-11-04');
    $submitted->update(['status' => 'submitted', 'appointment_start' => '13:00', 'appointment_end' => '13:45']);
    $this->actingAs($owner)->patchJson("/api/bookings/{$submitted->id}/reschedule", ['appointmentDate' => '2026-11-13', 'appointmentStart' => '10:15'])->assertOk();
});

test('a returned booking past its 7-day hold no longer holds a slot', function () {
    $b = approvedBlessing(User::factory()->create());
    $b->update(['status' => 'returned', 'returned_at' => now()->subDays(8)]);
    AuditLog::create(['actor_user_id' => null, 'action' => 'booking.returned', 'subject_type' => 'booking', 'subject_id' => $b->id,
        'metadata' => ['appointmentDate' => '2026-11-10', 'appointmentStart' => '10:00'], 'created_at' => now()->subDays(8)]);
    expect($b->fresh()->heldSlot())->toBeNull()->and($b->fresh()->holdsItsReturnedSlot())->toBeFalse();
});

test('heldSlot queries the audit log once per booking instance', function () {
    $b = approvedBlessing(User::factory()->create());
    $b->update(['status' => 'returned', 'returned_at' => now()]);
    AuditLog::create(['actor_user_id' => null, 'action' => 'booking.returned', 'subject_type' => 'booking', 'subject_id' => $b->id,
        'metadata' => ['appointmentDate' => '2026-11-10', 'appointmentStart' => '10:00'], 'created_at' => now()]);
    $fresh = $b->fresh();

    DB::enableQueryLog();
    $fresh->heldSlot(); $fresh->heldSlot(); $fresh->holdsItsReturnedSlot();
    $auditQueries = collect(DB::getQueryLog())->filter(fn ($q) => str_contains($q['query'], 'audit_logs'))->count();
    DB::disableQueryLog();

    expect($auditQueries)->toBe(1)->and($fresh->heldSlot())->toBe(['date' => '2026-11-10', 'start' => '10:00']);
});