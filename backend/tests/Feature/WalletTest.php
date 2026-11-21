<?php

use App\Models\Booking;
use App\Models\BookingDocumentReview;
use App\Models\User;
use App\Models\WalletDocument;
use App\Services\Register\ParishRegister;
use App\Support\StoredDocuments;
use Database\Seeders\ParishSettingSeeder;
use Database\Seeders\ServiceSeeder;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

beforeEach(function () {
    Storage::fake('local');
    $this->seed(ServiceSeeder::class);
    $this->seed(ParishSettingSeeder::class);
    $this->user = User::factory()->create(['role' => 'parishioner']);
});

/** Puts a file in the user's own folder, as POST /documents would, and returns its address. */
function ownFile(User $user, string $name = 'birth.pdf'): string
{
    Storage::disk('local')->put("documents/{$user->id}/{$name}", 'pdf');

    return "/documents/{$user->id}/{$name}";
}

test('adds a document by file upload', function () {
    $res = $this->actingAs($this->user)->post('/api/wallet', [
        'file' => UploadedFile::fake()->create('birth.pdf', 20, 'application/pdf'),
        'kind' => 'birth_certificate', 'personName' => 'Maria Santos',
    ], ['Accept' => 'application/json']);

    $res->assertCreated()->assertJsonStructure(['id', 'kind', 'personName', 'fileUrl', 'originalName', 'mime', 'sizeBytes', 'createdAt']);
    expect($res->json('fileUrl'))->toStartWith("/documents/{$this->user->id}/")
        ->and($res->json('originalName'))->toBe('birth.pdf')
        ->and($res->json('kind'))->toBe('birth_certificate')
        ->and($res->json('personName'))->toBe('Maria Santos');
    Storage::disk('local')->assertExists(ltrim($res->json('fileUrl'), '/'));
});

test('adds a document by the address of an upload in my own folder', function () {
    $url = ownFile($this->user);

    $this->actingAs($this->user)->postJson('/api/wallet', ['fileUrl' => $url, 'kind' => 'cenomar', 'personName' => 'Juan Cruz'])
        ->assertCreated()->assertJsonPath('fileUrl', $url)->assertJsonPath('originalName', 'birth.pdf');
    expect(WalletDocument::where('user_id', $this->user->id)->count())->toBe(1);
});

test("another user's file address and a made-up one are refused", function () {
    $other = User::factory()->create(['role' => 'parishioner']);
    $theirs = ownFile($other);

    $this->actingAs($this->user)->postJson('/api/wallet', ['fileUrl' => $theirs, 'kind' => 'other', 'personName' => 'X'])
        ->assertUnprocessable()->assertJsonValidationErrors('fileUrl');
    $this->actingAs($this->user)->postJson('/api/wallet', ['fileUrl' => "/documents/{$this->user->id}/nothing.pdf", 'kind' => 'other', 'personName' => 'X'])
        ->assertUnprocessable()->assertJsonValidationErrors('fileUrl');
    $this->actingAs($this->user)->postJson('/api/wallet', ['fileUrl' => "/documents/{$this->user->id}/../x.pdf", 'kind' => 'other', 'personName' => 'X'])
        ->assertUnprocessable()->assertJsonValidationErrors('fileUrl');
    expect(WalletDocument::count())->toBe(0);
});

test('kind and person name are validated, and either a file or an address is needed', function () {
    $url = ownFile($this->user);

    $this->actingAs($this->user)->postJson('/api/wallet', ['fileUrl' => $url, 'kind' => 'passport', 'personName' => 'X'])->assertJsonValidationErrors('kind');
    $this->actingAs($this->user)->postJson('/api/wallet', ['fileUrl' => $url, 'kind' => 'other'])->assertJsonValidationErrors('personName');
    $this->actingAs($this->user)->postJson('/api/wallet', ['fileUrl' => $url, 'kind' => 'other', 'personName' => str_repeat('a', 121)])->assertJsonValidationErrors('personName');
    $this->actingAs($this->user)->postJson('/api/wallet', ['kind' => 'other', 'personName' => 'X'])->assertUnprocessable();
});

test('the 31st document is refused', function () {
    WalletDocument::factory()->count(30)->create(['user_id' => $this->user->id]);
    $url = ownFile($this->user, 'extra.pdf');

    $this->actingAs($this->user)->postJson('/api/wallet', ['fileUrl' => $url, 'kind' => 'other', 'personName' => 'X'])
        ->assertUnprocessable()->assertJsonPath('message', 'Your wallet is full (30 documents). Delete one to add another.');
    expect(WalletDocument::where('user_id', $this->user->id)->count())->toBe(30);
});

test('a full wallet does not store an uploaded file it then refuses', function () {
    WalletDocument::factory()->count(30)->create(['user_id' => $this->user->id]);

    $this->actingAs($this->user)->post('/api/wallet', [
        'file' => UploadedFile::fake()->create('late.pdf', 20, 'application/pdf'), 'kind' => 'other', 'personName' => 'X',
    ], ['Accept' => 'application/json'])->assertUnprocessable();
    expect(Storage::disk('local')->allFiles("documents/{$this->user->id}"))->toBe([]);
});

test('the same address twice returns the existing row', function () {
    $url = ownFile($this->user);
    $first = $this->actingAs($this->user)->postJson('/api/wallet', ['fileUrl' => $url, 'kind' => 'cenomar', 'personName' => 'Juan'])->assertCreated();

    $second = $this->actingAs($this->user)->postJson('/api/wallet', ['fileUrl' => $url, 'kind' => 'other', 'personName' => 'Someone else'])->assertOk();

    expect($second->json('id'))->toBe($first->json('id'))->and($second->json('personName'))->toBe('Juan')
        ->and(WalletDocument::count())->toBe(1);
});

test('the list shows only my documents, newest first', function () {
    $old = WalletDocument::factory()->create(['user_id' => $this->user->id, 'created_at' => now()->subDay()]);
    $new = WalletDocument::factory()->create(['user_id' => $this->user->id]);
    WalletDocument::factory()->create(['user_id' => User::factory()->create(['role' => 'parishioner'])->id]);

    $res = $this->actingAs($this->user)->getJson('/api/wallet')->assertOk();

    expect(array_column($res->json(), 'id'))->toBe([$new->id, $old->id]);
});

test('deleting removes the row and the file when nothing else uses it', function () {
    $url = ownFile($this->user);
    $doc = WalletDocument::factory()->create(['user_id' => $this->user->id, 'file_url' => $url]);

    $this->actingAs($this->user)->deleteJson("/api/wallet/{$doc->id}")->assertNoContent();

    expect(WalletDocument::count())->toBe(0);
    Storage::disk('local')->assertMissing(ltrim($url, '/'));
});

test('deleting keeps the file a submitted booking uses, and it is still served to the owner and to staff', function () {
    $url = ownFile($this->user);
    $doc = WalletDocument::factory()->create(['user_id' => $this->user->id, 'file_url' => $url]);
    Booking::factory()->create(['user_id' => $this->user->id, 'status' => 'submitted', 'form_data' => ['birthCertificate' => $url, 'childFirstName' => 'A']]);

    $this->actingAs($this->user)->deleteJson("/api/wallet/{$doc->id}")->assertNoContent();

    expect(WalletDocument::count())->toBe(0);
    Storage::disk('local')->assertExists(ltrim($url, '/'));
    $this->actingAs($this->user)->get('/api'.$url)->assertOk();
    $this->actingAs(User::factory()->create(['role' => 'staff']))->get('/api'.$url)->assertOk();
});

test('deleting keeps a file whose name has an underscore when a booking uses it', function () {
    $url = ownFile($this->user, 'birth_cert-1.pdf');
    $doc = WalletDocument::factory()->create(['user_id' => $this->user->id, 'file_url' => $url]);
    Booking::factory()->create(['user_id' => $this->user->id, 'form_data' => ['nested' => ['files' => [$url]]]]);

    $this->actingAs($this->user)->deleteJson("/api/wallet/{$doc->id}")->assertNoContent();

    Storage::disk('local')->assertExists(ltrim($url, '/'));
});

test('deleting keeps the file when another wallet row uses it', function () {
    $url = ownFile($this->user);
    $doc = WalletDocument::factory()->create(['user_id' => $this->user->id, 'file_url' => $url]);
    WalletDocument::factory()->create(['user_id' => User::factory()->create(['role' => 'parishioner'])->id, 'file_url' => $url]);

    $this->actingAs($this->user)->deleteJson("/api/wallet/{$doc->id}")->assertNoContent();

    Storage::disk('local')->assertExists(ltrim($url, '/'));
});

test('another user cannot delete my document', function () {
    $doc = WalletDocument::factory()->create(['user_id' => $this->user->id]);

    $this->actingAs(User::factory()->create(['role' => 'parishioner']))->deleteJson("/api/wallet/{$doc->id}")->assertNotFound();
    expect(WalletDocument::count())->toBe(1);
});

test('staff accounts cannot use the wallet', function () {
    $staff = User::factory()->create(['role' => 'staff']);
    $admin = User::factory()->create(['role' => 'admin']);
    $doc = WalletDocument::factory()->create(['user_id' => $this->user->id]);

    foreach ([$staff, $admin] as $who) {
        $this->actingAs($who)->getJson('/api/wallet')->assertForbidden();
        $this->actingAs($who)->postJson('/api/wallet', ['kind' => 'other', 'personName' => 'X'])->assertForbidden();
        $this->actingAs($who)->deleteJson("/api/wallet/{$doc->id}")->assertForbidden();
    }
});

test('the wallet needs a signed-in account', function () {
    $this->getJson('/api/wallet')->assertUnauthorized();
});

test('wallet uploads share the document-upload counter', function () {
    foreach (range(1, 40) as $i) {
        $this->actingAs($this->user)->post('/api/documents', ['file' => UploadedFile::fake()->create("d{$i}.pdf", 20, 'application/pdf')], ['Accept' => 'application/json'])->assertSuccessful();
    }
    $this->actingAs($this->user)->post('/api/wallet', [
        'file' => UploadedFile::fake()->create('w.pdf', 20, 'application/pdf'), 'kind' => 'other', 'personName' => 'X',
    ], ['Accept' => 'application/json'])->assertStatus(429);
});

// ---- StoredDocuments::deleteIfUnreferenced -------------------------------------------------

test('deleteIfUnreferenced refuses anything that is not a documents address', function () {
    Storage::disk('local')->put('other/secret.txt', 'x');
    Storage::disk('local')->put("documents/{$this->user->id}/ok.pdf", 'x');

    foreach ([
        '/other/secret.txt', 'other/secret.txt', "/documents/{$this->user->id}/../../other/secret.txt",
        "/documents/{$this->user->id}/..%2Fx", "/documents/{$this->user->id}/a..b.pdf", '/documents/not-a-user/ok.pdf',
        "/documents/{$this->user->id}/sub/ok.pdf", "/documents/{$this->user->id}/", '',
    ] as $bad) {
        expect(StoredDocuments::deleteIfUnreferenced($bad))->toBeFalse();
    }
    Storage::disk('local')->assertExists('other/secret.txt');
    Storage::disk('local')->assertExists("documents/{$this->user->id}/ok.pdf");
});

test('deleteIfUnreferenced deletes an unreferenced file and says so', function () {
    $url = ownFile($this->user);

    expect(StoredDocuments::deleteIfUnreferenced($url))->toBeTrue();
    Storage::disk('local')->assertMissing(ltrim($url, '/'));
    expect(StoredDocuments::deleteIfUnreferenced($url))->toBeFalse(); // already gone
});

test('deleteIfUnreferenced keeps a file used by any booking, of any user or status, a walk-in, or a review', function () {
    $staff = User::factory()->create(['role' => 'staff']);
    $stranger = User::factory()->create(['role' => 'parishioner']);

    $cases = [
        'owner draft' => fn (string $u) => Booking::factory()->create(['user_id' => $this->user->id, 'status' => 'draft', 'form_data' => ['a' => $u]]),
        'cancelled' => fn (string $u) => Booking::factory()->create(['user_id' => $stranger->id, 'status' => 'cancelled', 'form_data' => ['a' => $u]]),
        'walk-in' => fn (string $u) => Booking::factory()->walkIn($staff)->create(['form_data' => ['a' => $u]]),
        'review' => fn (string $u) => BookingDocumentReview::create([
            'booking_id' => Booking::factory()->create(['user_id' => $stranger->id])->id, 'document_key' => 'a', 'file_url' => $u, 'status' => 'accepted',
        ]),
    ];
    $i = 0;
    foreach ($cases as $label => $make) {
        $url = ownFile($this->user, 'file_'.(++$i).'.pdf');
        $make($url);
        expect(StoredDocuments::deleteIfUnreferenced($url))->toBeFalse("{$label} should keep the file");
        Storage::disk('local')->assertExists(ltrim($url, '/'));
    }
});

test('a booking that mentions a longer file name does not protect a different file', function () {
    $url = ownFile($this->user, 'a.pdf');
    $longer = ownFile($this->user, 'a.pdf.bak');
    Booking::factory()->create(['user_id' => $this->user->id, 'form_data' => ['x' => $longer]]);

    expect(StoredDocuments::deleteIfUnreferenced($url))->toBeTrue();
});

// ---- GET /register-entries -------------------------------------------------------------------

function completedEntry(User $owner, string $ceremony, string $sacrament = 'baptism'): \App\Models\RegisterEntry
{
    $booking = Booking::factory()->scheduled($ceremony, '10:00', '11:00')->create([
        'user_id' => $owner->id, 'sacrament' => $sacrament, 'status' => 'completed',
        'form_data' => ['childFirstName' => 'Maria', 'childLastName' => 'Santos'],
    ]);

    return app(ParishRegister::class)->record($booking, null);
}

test("my certificates list holds my entries, newest ceremony first, and not anyone else's", function () {
    config(['app.parishioner_url' => 'https://parish.example.test']);
    $older = completedEntry($this->user, '2026-01-10');
    $newer = completedEntry($this->user, '2026-06-10', 'wedding');
    completedEntry(User::factory()->create(['role' => 'parishioner']), '2026-03-03');

    $res = $this->actingAs($this->user)->getJson('/api/register-entries')->assertOk();

    expect(array_column($res->json(), 'id'))->toBe([$newer->id, $older->id]);
    expect($res->json('0'))->toMatchArray([
        'id' => $newer->id, 'registerNumber' => $newer->register_number, 'register' => 'Marriage',
        'subjectName' => $newer->subject_name, 'ceremonyDate' => '2026-06-10', 'status' => 'valid', 'via' => 'booking',
    ])->and($res->json('0.verifyUrl'))->toStartWith('https://parish.example.test/verify');
});

test('a user with no completed bookings gets an empty list', function () {
    $this->actingAs($this->user)->getJson('/api/register-entries')->assertOk()->assertExactJson([]);
});
