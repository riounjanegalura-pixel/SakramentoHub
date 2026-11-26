<?php

use App\Models\AppNotification;
use App\Models\AuditLog;
use App\Models\Booking;
use App\Models\BookingDocumentReview;
use App\Models\User;
use Database\Seeders\ParishSettingSeeder;
use Database\Seeders\ServiceSeeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Storage;

beforeEach(function () {
    $this->seed(ServiceSeeder::class);
    $this->seed(ParishSettingSeeder::class);
    Carbon::setTestNow(Carbon::parse('2026-11-02 00:00:00', 'UTC'));
    Storage::fake('local');
    $this->owner = User::factory()->create(['role' => 'parishioner']);
    $this->staff = User::factory()->create(['role' => 'staff']);
});
afterEach(fn () => Carbon::setTestNow());

function sentBackFuneral(array $over = [], string $note = 'The scan is cut off'): Booking
{
    $owner = test()->owner;
    $b = Booking::factory()->scheduled('2026-11-10', '10:00', '11:00')->create($over + [
        'user_id' => $owner->id, 'sacrament' => 'funeral', 'status' => 'returned', 'payment_status' => 'not_required',
        'form_data' => formDataFixture('funeral/valid-basic', $owner->id),
    ]);
    BookingDocumentReview::create([
        'booking_id' => $b->id, 'document_key' => 'deathCertificate', 'file_url' => $b->form_data['deathCertificate'],
        'status' => 'rejected', 'note' => $note, 'reviewed_by' => test()->staff->id,
    ]);

    return $b;
}

function newScan(User $by, string $name = 'death-2.pdf'): string
{
    Storage::disk('local')->put("documents/{$by->id}/{$name}", 'x');

    return "/documents/{$by->id}/{$name}";
}

test('the owner replaces a document the office sent back, on any sacrament, while the booking is returned', function () {
    $b = sentBackFuneral();
    $old = $b->form_data['deathCertificate'];
    $url = newScan($this->owner);

    $res = $this->actingAs($this->owner)->putJson("/api/bookings/{$b->id}/documents/deathCertificate", ['fileUrl' => $url])->assertOk();

    $doc = collect($res->json('documents'))->firstWhere('key', 'deathCertificate');
    expect($doc['url'])->toBe($url)->and($doc['review'])->toBeNull();           // waiting for the office again
    expect($res->json('status'))->toBe('returned');                              // sending it back to review is the owner's next step
    expect($b->fresh()->form_data)->toMatchArray(['deathCertificate' => $url]);
    expect($doc['url'])->not->toBe($old);
});

test('it is audited, and the office is told which document and why it matters', function () {
    $b = sentBackFuneral();

    $this->actingAs($this->owner)->putJson("/api/bookings/{$b->id}/documents/deathCertificate", ['fileUrl' => newScan($this->owner)])->assertOk();

    $log = AuditLog::where('action', 'document.replaced')->sole();
    expect($log->subject_id)->toBe($b->id)->and($log->actor_user_id)->toBe($this->owner->id)->and($log->metadata)->toMatchArray(['documentKey' => 'deathCertificate']);
    $note = AppNotification::where('user_id', $this->staff->id)->sole();
    expect($note->title)->toBe('Document replaced')->and($note->booking_id)->toBe($b->id);
});

test('the other documents on the booking are untouched', function () {
    $owner = $this->owner;
    $b = Booking::factory()->create([
        'user_id' => $owner->id, 'sacrament' => 'baptism', 'status' => 'returned', 'payment_status' => 'not_required',
        'form_data' => formDataFixture('baptism/valid-basic', $owner->id),
    ]);
    BookingDocumentReview::create(['booking_id' => $b->id, 'document_key' => 'birthCertificate', 'file_url' => $b->form_data['birthCertificate'], 'status' => 'rejected', 'note' => 'Blurry', 'reviewed_by' => $this->staff->id]);
    BookingDocumentReview::create(['booking_id' => $b->id, 'document_key' => 'marriageContract', 'file_url' => $b->form_data['marriageContract'], 'status' => 'accepted', 'note' => null, 'reviewed_by' => $this->staff->id]);

    $res = $this->actingAs($owner)->putJson("/api/bookings/{$b->id}/documents/birthCertificate", ['fileUrl' => newScan($owner, 'birth-2.pdf')])->assertOk();

    $docs = collect($res->json('documents'))->keyBy('key');
    expect($docs['birthCertificate']['review'])->toBeNull()
        ->and($docs['marriageContract']['review']['status'])->toBe('accepted')
        ->and($docs['marriageContract']['url'])->toBe($b->form_data['marriageContract']);
});

test('a submitted booking whose document was refused can replace it too', function () {
    $b = sentBackFuneral(['status' => 'submitted']);

    $this->actingAs($this->owner)->putJson("/api/bookings/{$b->id}/documents/deathCertificate", ['fileUrl' => newScan($this->owner)])->assertOk()->assertJsonPath('status', 'submitted');
});

test('a document that was not sent back cannot be swapped this way', function () {
    $b = sentBackFuneral();
    BookingDocumentReview::where('booking_id', $b->id)->delete();

    $this->actingAs($this->owner)->putJson("/api/bookings/{$b->id}/documents/deathCertificate", ['fileUrl' => newScan($this->owner)])
        ->assertUnprocessable()->assertJsonPath('message', 'Documents can be added later only to a wedding booking.');
});

test('an accepted document is not replaced either', function () {
    $b = sentBackFuneral();
    BookingDocumentReview::where('booking_id', $b->id)->update(['status' => 'accepted', 'note' => null]);

    $this->actingAs($this->owner)->putJson("/api/bookings/{$b->id}/documents/deathCertificate", ['fileUrl' => newScan($this->owner)])->assertUnprocessable();
});

test('a closed booking and another person are refused', function (string $status) {
    $b = sentBackFuneral(['status' => $status]);

    $this->actingAs($this->owner)->putJson("/api/bookings/{$b->id}/documents/deathCertificate", ['fileUrl' => newScan($this->owner)])->assertUnprocessable();
})->with(['completed', 'cancelled', 'declined', 'draft']);

test('nobody else can replace my document, and the file has to be one I uploaded', function () {
    $b = sentBackFuneral();
    $other = User::factory()->create(['role' => 'parishioner']);

    $this->actingAs($other)->putJson("/api/bookings/{$b->id}/documents/deathCertificate", ['fileUrl' => newScan($other)])->assertNotFound();
    $this->actingAs($this->owner)->putJson("/api/bookings/{$b->id}/documents/deathCertificate", ['fileUrl' => newScan($other, 'theirs.pdf')])->assertUnprocessable()->assertJsonValidationErrors('fileUrl');
});
