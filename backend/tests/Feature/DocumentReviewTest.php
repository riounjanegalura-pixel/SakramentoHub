<?php

use App\Models\AuditLog;
use App\Models\Booking;
use App\Models\User;
use Illuminate\Support\Facades\Storage;

beforeEach(function () {
    $this->seed(\Database\Seeders\ServiceSeeder::class);
    $this->seed(\Database\Seeders\ParishSettingSeeder::class);
    \Illuminate\Support\Carbon::setTestNow(\Illuminate\Support\Carbon::parse('2026-11-02 00:00:00', 'UTC')); // Mon 08:00 Manila
    \Illuminate\Support\Facades\Storage::fake('local');
    $this->staff = \App\Models\User::factory()->create(['role' => 'staff']);
    $this->admin = \App\Models\User::factory()->create(['role' => 'admin']);
});
afterEach(fn () => \Illuminate\Support\Carbon::setTestNow());

function funeralWithDocs(User $owner, array $extra = []): Booking
{
    return Booking::factory()->scheduled('2026-11-03', '10:00', '11:00')->create(array_merge([
        'user_id' => $owner->id, 'sacrament' => 'funeral', 'status' => 'submitted', 'payment_status' => 'not_required',
        'form_data' => formDataFixture('funeral/valid-basic', $owner->id),
    ], $extra));
}

test('the checklist lists required and uploaded documents with no review yet', function () {
    $b = funeralWithDocs(User::factory()->create());
    $this->actingAs($this->staff)->getJson("/api/admin/bookings/{$b->id}")->assertOk()
        ->assertJsonCount(1, 'documents')
        ->assertJsonPath('documents.0.key', 'deathCertificate')
        ->assertJsonPath('documents.0.required', true)
        ->assertJsonPath('documents.0.review', null);
});

test('staff accept a document and it is audited', function () {
    $b = funeralWithDocs(User::factory()->create());
    $this->actingAs($this->staff)->putJson("/api/admin/bookings/{$b->id}/documents/deathCertificate", ['status' => 'accepted'])
        ->assertOk()->assertJsonPath('documents.0.review.status', 'accepted')
        ->assertJsonPath('documents.0.review.reviewedBy', $this->staff->full_name);
    expect(AuditLog::where('action', 'document.accepted')->where('subject_id', $b->id)->exists())->toBeTrue();
});

test('rejecting needs a note', function () {
    $b = funeralWithDocs(User::factory()->create());
    $this->actingAs($this->staff)->putJson("/api/admin/bookings/{$b->id}/documents/deathCertificate", ['status' => 'rejected'])->assertUnprocessable();
    $this->actingAs($this->staff)->putJson("/api/admin/bookings/{$b->id}/documents/deathCertificate", ['status' => 'rejected', 'note' => 'Blurry'])
        ->assertOk()->assertJsonPath('documents.0.review.note', 'Blurry');
});

test('an unknown key, a missing file and a closed booking are refused', function () {
    $owner = User::factory()->create();
    $b = funeralWithDocs($owner);
    $this->actingAs($this->staff)->putJson("/api/admin/bookings/{$b->id}/documents/nope", ['status' => 'accepted'])->assertUnprocessable();
    $approved = funeralWithDocs($owner, ['status' => 'approved', 'appointment_start' => '13:00', 'appointment_end' => '14:00']);
    $this->actingAs($this->staff)->putJson("/api/admin/bookings/{$approved->id}/documents/deathCertificate", ['status' => 'accepted'])->assertUnprocessable();
});

test('approve is refused until every uploaded document is accepted', function () {
    $b = funeralWithDocs(User::factory()->create());
    $this->actingAs($this->staff)->patchJson("/api/admin/bookings/{$b->id}/approve")
        ->assertUnprocessable()->assertJsonPath('message', 'Review every uploaded document before approving.');
    acceptAllDocuments($b);
    $this->actingAs($this->staff)->patchJson("/api/admin/bookings/{$b->id}/approve")->assertOk()->assertJsonPath('status', 'approved');
});

// Review Focus 1
test('replacing a file after it was accepted makes it unreviewed again', function () {
    $owner = User::factory()->create();
    $b = funeralWithDocs($owner);
    acceptAllDocuments($b);
    expect($b->fresh()->documentsCleared())->toBeTrue();

    Storage::disk('local')->put("documents/{$owner->id}/new-death-cert.pdf", 'x');
    $data = (array) $b->form_data;
    $data['deathCertificate'] = "/documents/{$owner->id}/new-death-cert.pdf";
    $b->update(['form_data' => $data]);

    expect($b->fresh()->documentsCleared())->toBeFalse();
    $this->actingAs($this->staff)->getJson("/api/admin/bookings/{$b->id}")->assertJsonPath('documents.0.review', null);
    $this->actingAs($this->staff)->patchJson("/api/admin/bookings/{$b->id}/approve")->assertUnprocessable();
});

test('a booking with no documents is cleared', function () {
    $b = Booking::factory()->create(['sacrament' => 'house-blessing', 'form_data' => ['propertyOwner' => 'A']]);
    expect($b->documentsCleared())->toBeTrue()->and($b->documentChecklist())->toBe([]);
});

test('return needs a note unless a document is rejected, and the notification names it', function () {
    $owner = User::factory()->create();
    $b = funeralWithDocs($owner);
    $this->actingAs($this->staff)->patchJson("/api/admin/bookings/{$b->id}/return")->assertUnprocessable()
        ->assertJsonPath('message', 'Write what needs to change, or reject at least one document.');

    $this->actingAs($this->staff)->putJson("/api/admin/bookings/{$b->id}/documents/deathCertificate", ['status' => 'rejected', 'note' => 'Blurry']);
    $this->actingAs($this->staff)->patchJson("/api/admin/bookings/{$b->id}/return")->assertOk()->assertJsonPath('status', 'returned');

    $body = \App\Models\AppNotification::where('user_id', $owner->id)->latest('id')->value('body');
    expect($body)->toContain($b->fresh()->documentChecklist()[0]['label']);
});

test('the parishioner sees review state but not the reviewer', function () {
    $owner = User::factory()->create();
    $b = funeralWithDocs($owner);
    $this->actingAs($this->staff)->putJson("/api/admin/bookings/{$b->id}/documents/deathCertificate", ['status' => 'rejected', 'note' => 'Blurry']);
    $json = $this->actingAs($owner)->getJson("/api/bookings/{$b->id}")->assertOk()
        ->assertJsonPath('documents.0.review.status', 'rejected')->assertJsonPath('documents.0.review.note', 'Blurry')->json();
    expect($json['documents'][0]['review'])->not->toHaveKey('reviewedBy');
});

test('payment auto-approval waits for documents', function () {
    config(['paymongo.auto_approve_on_payment' => true]);
    $owner = User::factory()->create();
    $b = Booking::factory()->scheduled('2027-03-03', '10:00', '11:30')->create([
        'user_id' => $owner->id, 'sacrament' => 'wedding', 'status' => 'submitted', 'payment_status' => 'unpaid',
        'amount_due_centavos' => 500000, 'payment_hold_expires_at' => now()->addDay(),
        'form_data' => formDataFixture('wedding/valid-basic', $owner->id),
    ]);
    app(\App\Services\Booking\BookingStateMachine::class)->recordPayment($b, 'cs_1', 'pay_1', 500000, 'evt_1');
    expect($b->fresh()->status->value)->toBe('submitted')->and($b->fresh()->payment_status->value)->toBe('paid');
});

test('parishioners cannot review documents', function () {
    $owner = User::factory()->create();
    $b = funeralWithDocs($owner);
    $this->actingAs($owner)->putJson("/api/admin/bookings/{$b->id}/documents/deathCertificate", ['status' => 'accepted'])->assertForbidden();
});
