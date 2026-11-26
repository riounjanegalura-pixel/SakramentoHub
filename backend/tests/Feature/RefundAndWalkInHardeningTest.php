<?php

use App\Models\AppNotification;
use App\Models\AuditLog;
use App\Models\Booking;
use App\Models\User;
use App\Services\Booking\BookingStateMachine;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

// Lead amendment L11: hardening from the A5-A7 reviews.

beforeEach(function () {
    $this->seed(\Database\Seeders\ServiceSeeder::class);
    $this->seed(\Database\Seeders\ParishSettingSeeder::class);
    \Illuminate\Support\Carbon::setTestNow(\Illuminate\Support\Carbon::parse('2026-11-02 00:00:00', 'UTC')); // Mon 08:00 Manila
    Storage::fake('local');
    $this->staff = User::factory()->create(['role' => 'staff']);
    $this->admin = User::factory()->create(['role' => 'admin']);
});
afterEach(fn () => \Illuminate\Support\Carbon::setTestNow());

function hardeningWedding(?User $owner, array $extra = []): Booking
{
    return Booking::factory()->scheduled('2027-03-03', '10:00', '11:30')->create(array_merge([
        'user_id' => $owner?->id, 'sacrament' => 'wedding', 'status' => 'submitted', 'payment_status' => 'refund_due',
        'amount_due_centavos' => 500000, 'amount_paid_centavos' => 500000, 'payment_hold_expires_at' => null,
        'form_data' => formDataFixture('wedding/valid-basic', $owner?->id ?? User::factory()->create()->id),
    ], $extra));
}

// (a)
test('a late replay of a payment that was already refunded is a duplicate, with no alert and no audit', function () {
    $machine = app(BookingStateMachine::class);
    $b = hardeningWedding(User::factory()->create(), ['paymongo_payment_id' => 'pay_old']);
    $machine->markRefunded($b, $this->staff, 'PM-REF-1');
    expect($machine->recordPayment($b->fresh(), 'cs_new', 'pay_new', 500000, 'evt_new'))->toBe('processed'); // the booking now carries pay_new

    AppNotification::query()->delete();
    $audits = AuditLog::where('subject_id', $b->id)->count();

    expect($machine->recordPayment($b->fresh(), 'cs_old', 'pay_old', 500000, 'evt_replay'))->toBe('duplicate');
    expect(AppNotification::where('title', 'Refund due')->exists())->toBeFalse()
        ->and(AuditLog::where('subject_id', $b->id)->count())->toBe($audits)
        ->and($b->fresh()->payment_status->value)->toBe('paid');
});

test('a genuinely different extra payment on a paid booking is still flagged', function () {
    $machine = app(BookingStateMachine::class);
    $b = hardeningWedding(User::factory()->create(), ['paymongo_payment_id' => 'pay_old']);
    $machine->markRefunded($b, $this->staff, 'PM-REF-1');
    $machine->recordPayment($b->fresh(), 'cs_new', 'pay_new', 500000, 'evt_new');

    expect($machine->recordPayment($b->fresh(), 'cs_x', 'pay_other', 500000, 'evt_x'))->toBe('refund_due');
});

// (b)
test('marking refunded reports what is still owed, not the full amount paid', function () {
    $b = hardeningWedding(User::factory()->create(), ['status' => 'cancelled', 'amount_paid_centavos' => 500000, 'amount_refunded_centavos' => 100000, 'paymongo_payment_id' => 'pay_1']);
    app(BookingStateMachine::class)->markRefunded($b, $this->staff, 'PM-REF-2');

    $meta = AuditLog::where('action', 'booking.refunded')->where('subject_id', $b->id)->first()->metadata;
    expect($meta['amountCentavos'])->toBe(400000)->and($meta['paymentId'])->toBe('pay_1');
    expect($b->fresh()->amount_refunded_centavos)->toBe(500000);
    expect(AppNotification::where('user_id', $b->user_id)->latest('id')->value('body'))->toContain('₱4,000.00');
});

// (c)
test('refresh() clears the remembered held slot and still reloads the model', function () {
    $b = Booking::factory()->scheduled('2026-11-10', '10:00', '11:00')->create([
        'sacrament' => 'funeral', 'status' => 'returned', 'returned_at' => now(), 'payment_status' => 'not_required',
    ]);
    $log = AuditLog::create(['actor_user_id' => null, 'action' => 'booking.returned', 'subject_type' => 'booking', 'subject_id' => $b->id,
        'metadata' => ['appointmentDate' => '2026-11-10', 'appointmentStart' => '10:00'], 'created_at' => now()]);
    expect($b->heldSlot())->toBe(['date' => '2026-11-10', 'start' => '10:00']);

    $log->update(['metadata' => ['appointmentDate' => '2026-11-12', 'appointmentStart' => '14:00']]);
    Booking::whereKey($b->id)->update(['sacrament' => 'baptism']);
    $b->refresh();

    expect($b->sacrament)->toBe('baptism')->and($b->heldSlot())->toBe(['date' => '2026-11-12', 'start' => '14:00']);
});

// (d)
test('staff can reschedule a submitted booking and it stays submitted', function () {
    $owner = User::factory()->create();
    $b = Booking::factory()->scheduled('2026-11-10', '10:00', '10:45')->create([
        'user_id' => $owner->id, 'sacrament' => 'house-blessing', 'status' => 'submitted', 'payment_status' => 'not_required',
        'is_offsite' => true, 'form_data' => ['propertyType' => 'house', 'propertyOwner' => 'A'],
    ]);
    $this->actingAs($this->staff)->patchJson("/api/admin/bookings/{$b->id}/reschedule", [
        'appointmentDate' => '2026-11-12', 'appointmentStart' => '14:30', 'reason' => 'Asked by phone',
    ])->assertOk()->assertJsonPath('status', 'submitted')->assertJsonPath('appointmentDate', '2026-11-12')->assertJsonPath('appointmentStart', '14:30');
});

test('staff can reschedule a booking with no account', function () {
    $b = Booking::factory()->walkIn($this->staff)->scheduled('2026-11-10', '10:00', '10:45')->create([
        'sacrament' => 'house-blessing', 'status' => 'approved', 'payment_status' => 'not_required',
        'is_offsite' => true, 'form_data' => ['propertyType' => 'house', 'propertyOwner' => 'A'],
    ]);
    expect($b->user_id)->toBeNull();
    $this->actingAs($this->staff)->patchJson("/api/admin/bookings/{$b->id}/reschedule", [
        'appointmentDate' => '2026-11-12', 'appointmentStart' => '14:30', 'reason' => 'Asked at the desk',
    ])->assertOk()->assertJsonPath('status', 'approved')->assertJsonPath('appointmentDate', '2026-11-12');
});

// (e)
test('the parishioner payment endpoint does not share the per-user counter of the whole group', function () {
    $owner = User::factory()->create();
    $b = Booking::factory()->create(['user_id' => $owner->id, 'sacrament' => 'funeral', 'status' => 'draft']);

    foreach (range(1, 8) as $i) {
        expect($this->actingAs($owner)->postJson("/api/bookings/{$b->id}/payment")->status())->not->toBe(429);
    }
});

// (f)
test('the owner of a booking can open a file staff attached to it, and nobody else can', function () {
    $account = User::factory()->create();
    $stranger = User::factory()->create();
    $path = "documents/{$this->staff->id}/walkin-cert.pdf";
    Storage::disk('local')->put($path, 'x');
    Booking::factory()->walkIn($this->staff)->create(['user_id' => $account->id, 'sacrament' => 'funeral', 'status' => 'submitted',
        'form_data' => ['deathCertificate' => "/{$path}"]]);
    Storage::disk('local')->put("documents/{$this->staff->id}/other.pdf", 'x');

    $this->actingAs($account)->get("/api/{$path}")->assertOk();
    $this->actingAs($account)->get("/api/documents/{$this->staff->id}/other.pdf")->assertForbidden(); // attached to nothing of theirs
    $this->actingAs($stranger)->get("/api/{$path}")->assertForbidden();
});

// (g)
test('a linked walk-in still in draft is hidden from the parishioner and cannot be edited or submitted by them', function () {
    $account = User::factory()->create();
    $account->forceFill(['email_verified_at' => now()])->save();
    $draft = Booking::factory()->walkIn($this->staff)->create(['user_id' => $account->id, 'sacrament' => 'funeral', 'status' => 'draft']);

    $this->actingAs($account)->getJson('/api/bookings')->assertJsonCount(0);
    $this->actingAs($account)->patchJson("/api/bookings/{$draft->id}", ['formData' => ['deceasedFirstName' => 'X']])->assertNotFound();
    $this->actingAs($account)->patchJson("/api/bookings/{$draft->id}/submit")->assertNotFound();
    expect($draft->fresh()->status->value)->toBe('draft');

    $draft->update(['status' => 'submitted']);
    $this->actingAs($account)->getJson('/api/bookings')->assertJsonCount(1);
});

// (h)
test('the admin booking resource gives the walk-in contact from the snapshot, and null for online bookings', function () {
    $walkIn = Booking::factory()->walkIn($this->staff, ['fullName' => 'Lola Nena Cruz', 'phone' => '09171234567', 'email' => null, 'relationship' => 'Daughter'])
        ->create(['sacrament' => 'funeral', 'status' => 'draft']);
    $online = Booking::factory()->create(['sacrament' => 'funeral', 'status' => 'submitted']);

    $this->actingAs($this->staff)->getJson("/api/admin/bookings/{$walkIn->id}")->assertOk()
        ->assertJsonPath('walkInContact', ['fullName' => 'Lola Nena Cruz', 'phone' => '09171234567', 'email' => null, 'relationship' => 'Daughter']);
    $this->actingAs($this->staff)->getJson("/api/admin/bookings/{$online->id}")->assertOk()->assertJsonPath('walkInContact', null);
});

test('a walk-in contact saves its relationship', function () {
    $res = $this->actingAs($this->staff)->postJson('/api/admin/walk-ins', [
        'sacrament' => 'funeral', 'contact' => ['fullName' => 'Lola Nena Cruz', 'phone' => '09171234567', 'relationship' => 'Daughter'],
        'formData' => formDataFixture('funeral/valid-basic', $this->staff->id),
    ])->assertCreated();
    $res->assertJsonPath('walkInContact.relationship', 'Daughter')->assertJsonPath('walkInContact.fullName', 'Lola Nena Cruz');
});

// (i)
test('an empty contact cannot wipe a walk-in contact', function () {
    $b = Booking::factory()->walkIn($this->staff, ['fullName' => 'Lola Nena Cruz', 'phone' => '09171234567'])->create(['sacrament' => 'funeral', 'status' => 'draft']);
    $this->actingAs($this->staff)->patchJson("/api/admin/walk-ins/{$b->id}", ['contact' => []])->assertUnprocessable();
    expect($b->fresh()->owner_snapshot['fullName'])->toBe('Lola Nena Cruz');
});

// (ii)
test('any active staff member can finish another staff member\'s walk-in with their own uploads', function () {
    $other = User::factory()->create(['role' => 'staff']);
    $b = Booking::factory()->walkIn($this->staff)->scheduled('2026-11-03', '10:00', '11:00')->create([
        'sacrament' => 'funeral', 'status' => 'draft', 'form_data' => formDataFixture('funeral/valid-basic', $other->id),
    ]);
    $this->actingAs($other)->patchJson("/api/admin/walk-ins/{$b->id}/submit")->assertOk()->assertJsonPath('status', 'submitted');

    // not an arbitrary parishioner's upload, and not a deactivated staff member's
    $stranger = User::factory()->create();
    $b2 = Booking::factory()->walkIn($this->staff)->scheduled('2026-11-04', '10:00', '11:00')->create([
        'sacrament' => 'funeral', 'status' => 'draft', 'form_data' => formDataFixture('funeral/valid-basic', $stranger->id),
    ]);
    $this->actingAs($this->staff)->patchJson("/api/admin/walk-ins/{$b2->id}/submit")->assertUnprocessable()->assertJsonValidationErrors(['formData.deathCertificate']);
    $gone = User::factory()->create(['role' => 'staff', 'is_active' => false]);
    $b2->update(['form_data' => formDataFixture('funeral/valid-basic', $gone->id)]);
    $this->actingAs($this->staff)->patchJson("/api/admin/walk-ins/{$b2->id}/submit")->assertUnprocessable();
});

test('an online booking still accepts only its owner\'s uploads', function () {
    $other = User::factory()->create(['role' => 'staff']);
    $owner = User::factory()->create();
    $owner->forceFill(['email_verified_at' => now()])->save();
    $b = Booking::factory()->scheduled('2026-11-03', '10:00', '11:00')->create([
        'user_id' => $owner->id, 'sacrament' => 'funeral', 'status' => 'draft', 'form_data' => formDataFixture('funeral/valid-basic', $other->id),
    ]);
    $this->actingAs($owner)->patchJson("/api/bookings/{$b->id}/submit")->assertUnprocessable();
});

// (iii)
test('the staff payment link answers 409 for a paid booking and the hold-lapsed message for a lapsed one', function () {
    $paid = Booking::factory()->walkIn($this->staff)->create(['sacrament' => 'wedding', 'status' => 'submitted', 'payment_status' => 'paid', 'amount_due_centavos' => 500000]);
    $this->actingAs($this->staff)->postJson("/api/admin/bookings/{$paid->id}/payment")->assertStatus(409)->assertJsonPath('message', 'This booking has already been paid.');

    $lapsed = Booking::factory()->walkIn($this->staff)->create([
        'sacrament' => 'wedding', 'status' => 'submitted', 'payment_status' => 'unpaid', 'amount_due_centavos' => 500000, 'payment_hold_expires_at' => now()->subMinute(),
    ]);
    $this->actingAs($this->staff)->postJson("/api/admin/bookings/{$lapsed->id}/payment")->assertUnprocessable()
        ->assertJsonPath('message', 'The payment window for this booking has closed, so its time is no longer held. Please make a new booking.');
});

// D2 whole-branch review: deleting the linked account must not wipe the counter contact.
test('deleting a linked account keeps the walk-in contact the office typed at the counter', function () {
    $owner = User::factory()->create(['full_name' => 'Rosa Account', 'email' => 'rosa@example.com', 'password' => \Illuminate\Support\Facades\Hash::make('correctpass1')]);
    $walkIn = Booking::factory()->walkIn($this->staff, ['fullName' => 'Rosa Dela Cruz', 'phone' => '09171234567', 'email' => 'rosa@example.com', 'relationship' => 'Mother'])
        ->create(['user_id' => $owner->id, 'sacrament' => 'house-blessing', 'status' => 'submitted']);
    $online = Booking::factory()->create(['user_id' => $owner->id, 'sacrament' => 'house-blessing', 'status' => 'submitted']);

    $this->actingAs($owner)->deleteJson('/api/me', ['currentPassword' => 'correctpass1'])->assertNoContent();

    expect($walkIn->fresh()->owner_snapshot)->toEqualCanonicalizing(['fullName' => 'Rosa Dela Cruz', 'phone' => '09171234567', 'email' => 'rosa@example.com', 'relationship' => 'Mother', 'accountDeleted' => true])
        ->and($online->fresh()->owner_snapshot)->toEqualCanonicalizing(['fullName' => 'Rosa Account', 'email' => 'rosa@example.com', 'accountDeleted' => true]);
    $this->actingAs($this->staff)->getJson("/api/admin/bookings/{$walkIn->id}")
        ->assertJsonPath('user.phone', '09171234567')->assertJsonPath('walkInContact.relationship', 'Mother');
});
