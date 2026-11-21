<?php

use App\Models\AuditLog;
use App\Models\Booking;
use App\Models\CertificateRequest;
use App\Models\RegisterEntry;
use App\Models\User;
use App\Models\WalletDocument;
use App\Services\Register\ParishRegister;
use Database\Seeders\ParishSettingSeeder;
use Database\Seeders\ServiceSeeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;

beforeEach(function () {
    $this->seed(ServiceSeeder::class);
    $this->seed(ParishSettingSeeder::class);
    Storage::fake('local');
    Carbon::setTestNow(Carbon::parse('2026-11-02 00:00:00', 'UTC'));
    $this->user = User::factory()->create(['role' => 'parishioner', 'full_name' => 'Rita Reyes', 'email' => 'rita@gmail.com', 'password' => Hash::make('correctpass1')]);
    $this->staff = User::factory()->create(['role' => 'staff']);
});
afterEach(fn () => Carbon::setTestNow());

/** A file in a user's own upload folder; returns its address. */
function storedFile(User $user, string $name): string
{
    Storage::disk('local')->put("documents/{$user->id}/{$name}", 'x');

    return "/documents/{$user->id}/{$name}";
}

function deleteAccount(User $user)
{
    return test()->actingAs($user)->deleteJson('/api/me', ['currentPassword' => 'correctpass1']);
}

function fileExists(string $url): bool
{
    return Storage::disk('local')->exists(ltrim($url, '/'));
}

// ---- Deletion --------------------------------------------------------------------------------

test('deleting an account removes its wallet rows and the files no booking uses, and keeps one a booking uses', function () {
    $free = storedFile($this->user, 'free.pdf');
    $used = storedFile($this->user, 'used.pdf');
    WalletDocument::factory()->create(['user_id' => $this->user->id, 'file_url' => $free]);
    WalletDocument::factory()->create(['user_id' => $this->user->id, 'file_url' => $used]);
    Booking::factory()->create(['user_id' => $this->user->id, 'sacrament' => 'baptism', 'status' => 'submitted', 'form_data' => ['birthCertificate' => $used]]);

    deleteAccount($this->user)->assertNoContent();

    expect(WalletDocument::count())->toBe(0)
        ->and(fileExists($free))->toBeFalse()
        ->and(fileExists($used))->toBeTrue();
});

test('deleting an account does not touch another user\'s wallet', function () {
    $other = User::factory()->create(['role' => 'parishioner']);
    $theirs = storedFile($other, 'theirs.pdf');
    WalletDocument::factory()->create(['user_id' => $other->id, 'file_url' => $theirs]);

    deleteAccount($this->user)->assertNoContent();

    expect(WalletDocument::count())->toBe(1)->and(fileExists($theirs))->toBeTrue();
});

test('deleting an account cancels its open requests and deletes their ID and letter files', function () {
    $id = storedFile($this->user, 'id.jpg');
    $letter = storedFile($this->user, 'letter.pdf');
    $open = CertificateRequest::factory()->create(['user_id' => $this->user->id, 'status' => 'submitted', 'id_url' => $id, 'letter_url' => $letter, 'relationship' => 'representative']);

    deleteAccount($this->user)->assertNoContent();

    $open->refresh();
    expect($open->status)->toBe('cancelled')
        ->and($open->closed_at)->not->toBeNull()
        ->and($open->id_url)->toBeNull()->and($open->letter_url)->toBeNull()
        ->and($open->files_removed_at)->not->toBeNull()
        ->and($open->user_id)->toBeNull()
        ->and($open->owner_snapshot)->toMatchArray(['fullName' => 'Rita Reyes', 'email' => 'rita@gmail.com', 'accountDeleted' => true])
        ->and(fileExists($id))->toBeFalse()->and(fileExists($letter))->toBeFalse();
});

test('a file a cancelled request shares with a booking stays', function () {
    $id = storedFile($this->user, 'id.jpg');
    CertificateRequest::factory()->create(['user_id' => $this->user->id, 'status' => 'submitted', 'id_url' => $id]);
    Booking::factory()->create(['user_id' => $this->user->id, 'sacrament' => 'baptism', 'status' => 'submitted', 'form_data' => ['validId' => $id]]);

    deleteAccount($this->user)->assertNoContent();

    expect(fileExists($id))->toBeTrue();
});

test('issued and declined requests are kept with a snapshot of who asked, and keep their status', function () {
    $entry = RegisterEntry::factory()->create();
    $issued = CertificateRequest::factory()->create(['user_id' => $this->user->id, 'status' => 'issued', 'register_entry_id' => $entry->id, 'closed_at' => now(), 'handled_by' => $this->staff->id]);
    $declined = CertificateRequest::factory()->create(['user_id' => $this->user->id, 'status' => 'declined', 'decline_reason' => 'No such record', 'closed_at' => now(), 'handled_by' => $this->staff->id]);

    deleteAccount($this->user)->assertNoContent();

    foreach ([$issued, $declined] as $request) {
        $request->refresh();
        expect($request->user_id)->toBeNull()
            ->and($request->owner_snapshot)->toEqualCanonicalizing(['fullName' => 'Rita Reyes', 'email' => 'rita@gmail.com', 'accountDeleted' => true]);
    }
    expect($issued->status)->toBe('issued')->and($issued->registerEntry->id)->toBe($entry->id)
        ->and($declined->status)->toBe('declined')->and($declined->requesterName())->toBe('Rita Reyes');
});

test('register entries and their certificates stay, and staff can still open them', function () {
    $booking = Booking::factory()->scheduled('2026-10-10', '10:00', '11:00')->create([
        'user_id' => $this->user->id, 'sacrament' => 'baptism', 'status' => 'completed',
        'form_data' => ['childFirstName' => 'Maria', 'childLastName' => 'Santos', 'motherFirstName' => 'Ana', 'motherLastName' => 'Santos'],
    ]);
    $entry = app(ParishRegister::class)->record($booking, $this->staff);

    deleteAccount($this->user)->assertNoContent();

    expect(RegisterEntry::find($entry->id))->not->toBeNull()
        ->and($booking->fresh()->owner_snapshot)->toMatchArray(['fullName' => 'Rita Reyes', 'accountDeleted' => true]);
    $this->actingAs($this->staff)->get("/api/admin/register/{$entry->id}/certificate")->assertOk()->assertSee($entry->register_number);
    $this->actingAs($this->staff)->get("/api/admin/bookings/{$booking->id}/certificate")->assertOk();
    $this->postJson('/api/verify', ['number' => $entry->register_number, 'code' => ParishRegister::formatCode($entry->verify_code)])->assertOk()->assertJsonPath('status', 'valid');
});

test('booking files stay after the account is deleted', function () {
    $file = storedFile($this->user, 'baptism.pdf');
    Booking::factory()->create(['user_id' => $this->user->id, 'sacrament' => 'baptism', 'status' => 'approved', 'form_data' => ['birthCertificate' => $file]]);

    deleteAccount($this->user)->assertNoContent();

    expect(fileExists($file))->toBeTrue();
});

test('a wrong password deletes nothing', function () {
    $file = storedFile($this->user, 'free.pdf');
    WalletDocument::factory()->create(['user_id' => $this->user->id, 'file_url' => $file]);
    $open = CertificateRequest::factory()->create(['user_id' => $this->user->id, 'status' => 'submitted']);

    $this->actingAs($this->user)->deleteJson('/api/me', ['currentPassword' => 'wrong'])->assertUnprocessable();

    expect(WalletDocument::count())->toBe(1)->and(fileExists($file))->toBeTrue()->and($open->fresh()->status)->toBe('submitted');
});

test('the booking snapshot is marked once, by the one implementation', function () {
    Booking::factory()->create(['user_id' => $this->user->id, 'sacrament' => 'baptism', 'status' => 'submitted']);

    deleteAccount($this->user)->assertNoContent();

    expect(Booking::first()->owner_snapshot)->toEqualCanonicalizing(['fullName' => 'Rita Reyes', 'email' => 'rita@gmail.com', 'accountDeleted' => true]);
});

// ---- Export ----------------------------------------------------------------------------------

test('the export lists wallet metadata, certificate requests and register entries, and no file contents', function () {
    $file = storedFile($this->user, 'birth.pdf');
    $doc = WalletDocument::factory()->create(['user_id' => $this->user->id, 'file_url' => $file, 'kind' => 'birth_certificate', 'person_name' => 'Maria Santos', 'original_name' => 'birth.pdf']);
    WalletDocument::factory()->create(); // someone else's
    $request = CertificateRequest::factory()->create(['user_id' => $this->user->id, 'person_name' => 'Rita Reyes']);
    CertificateRequest::factory()->create(); // someone else's
    $booking = Booking::factory()->scheduled('2026-10-10', '10:00', '11:00')->create([
        'user_id' => $this->user->id, 'sacrament' => 'baptism', 'status' => 'completed',
        'form_data' => ['childFirstName' => 'Maria', 'childLastName' => 'Santos', 'motherFirstName' => 'Ana', 'motherLastName' => 'Santos'],
    ]);
    $entry = app(ParishRegister::class)->record($booking, $this->staff);
    $stranger = Booking::factory()->scheduled('2026-10-11', '10:00', '11:00')->create(['sacrament' => 'baptism', 'status' => 'completed', 'form_data' => ['childFirstName' => 'X', 'childLastName' => 'Y']]);
    app(ParishRegister::class)->record($stranger, $this->staff);

    $body = $this->actingAs($this->user)->getJson('/api/me/export')->assertOk()->json();

    expect($body['wallet'])->toHaveCount(1)
        ->and($body['wallet'][0])->toBe([
            'id' => $doc->id, 'kind' => 'birth_certificate', 'personName' => 'Maria Santos', 'originalName' => 'birth.pdf',
            'mime' => 'application/pdf', 'sizeBytes' => 1024, 'createdAt' => $doc->created_at->toIso8601String(),
        ])
        ->and($body['certificateRequests'])->toHaveCount(1)
        ->and($body['certificateRequests'][0])->toMatchArray(['id' => $request->id, 'referenceNumber' => $request->reference_number, 'personName' => 'Rita Reyes', 'status' => 'submitted'])
        ->and($body['registerEntries'])->toBe([[
            'registerNumber' => $entry->register_number, 'register' => 'Baptism', 'ceremonyDate' => '2026-10-10', 'status' => 'valid',
        ]]);
    expect(json_encode($body))->not->toContain($file)->not->toContain('/documents/');
});

test('the export is empty in the new blocks for a new account', function () {
    $body = $this->actingAs($this->user)->getJson('/api/me/export')->assertOk()->json();

    expect($body['wallet'])->toBe([])->and($body['certificateRequests'])->toBe([])->and($body['registerEntries'])->toBe([]);
});

test('deleting an account removes a never-attached upload and a replaced late file, and keeps what a booking uses', function () {
    $orphan = storedFile($this->user, 'orphan.pdf');
    $used = storedFile($this->user, 'used.pdf');
    Booking::factory()->create(['user_id' => $this->user->id, 'sacrament' => 'baptism', 'status' => 'submitted', 'form_data' => ['birthCertificate' => $used]]);

    deleteAccount($this->user)->assertNoContent();

    expect(fileExists($orphan))->toBeFalse()->and(fileExists($used))->toBeTrue();
});

test('deleting an account removes its drafts and their files', function () {
    $file = storedFile($this->user, 'draft-doc.pdf');
    Booking::factory()->create(['user_id' => $this->user->id, 'sacrament' => 'baptism', 'status' => 'draft', 'form_data' => ['birthCertificate' => $file]]);
    $kept = Booking::factory()->create(['user_id' => $this->user->id, 'sacrament' => 'baptism', 'status' => 'submitted', 'form_data' => []]);

    deleteAccount($this->user)->assertNoContent();

    expect(Booking::where('status', 'draft')->count())->toBe(0)
        ->and(Booking::find($kept->id))->not->toBeNull()
        ->and(fileExists($file))->toBeFalse();
});

test('deleting an account keeps the staff-uploaded files of a walk-in it is linked to', function () {
    $staffFile = storedFile($this->staff, 'counter.pdf');
    $walkIn = Booking::factory()->walkIn($this->staff)->create(['user_id' => $this->user->id, 'sacrament' => 'baptism', 'status' => 'submitted', 'form_data' => ['birthCertificate' => $staffFile]]);

    deleteAccount($this->user)->assertNoContent();

    expect(Booking::find($walkIn->id))->not->toBeNull()->and(fileExists($staffFile))->toBeTrue();
});
