<?php

use App\Models\AppNotification;
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
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Storage;

beforeEach(function () {
    Storage::fake('local');
    $this->seed(ServiceSeeder::class);
    $this->seed(ParishSettingSeeder::class);
    Carbon::setTestNow(Carbon::parse('2026-11-02 00:00:00', 'UTC'));
    $this->user = User::factory()->create(['role' => 'parishioner', 'full_name' => 'Rita Reyes', 'phone' => '0917 000 0000']);
    $this->staff = User::factory()->create(['role' => 'staff', 'full_name' => 'Sam Staff']);
    $this->admin = User::factory()->create(['role' => 'admin', 'full_name' => 'Ada Admin']);
});
afterEach(fn () => Carbon::setTestNow());

function certFile(User $user, string $name = 'id.jpg'): string
{
    Storage::disk('local')->put("documents/{$user->id}/{$name}", 'img');

    return "/documents/{$user->id}/{$name}";
}

function certBody(User $user, array $over = []): array
{
    return $over + [
        'sacrament' => 'baptism', 'personName' => 'Rita Reyes', 'sacramentDateText' => 'May 1998',
        'details' => ['fatherName' => 'Ramon Reyes', 'motherName' => 'Rosa Reyes'],
        'relationship' => 'self', 'purpose' => 'Marriage requirement', 'idUrl' => certFile($user),
    ];
}

function certRequestFor(User $user, array $over = []): CertificateRequest
{
    return CertificateRequest::factory()->create($over + ['user_id' => $user->id]);
}

function certEntry(string $sacrament = 'baptism', string $name = 'Rita Reyes'): RegisterEntry
{
    return RegisterEntry::factory()->create(['sacrament' => $sacrament, 'subject_name' => $name, 'booking_id' => null, 'source' => 'transcribed']);
}

test('a parishioner submits a request and gets it back in the documented shape', function () {
    $res = $this->actingAs($this->user)->postJson('/api/certificate-requests', certBody($this->user));

    $res->assertCreated()->assertJsonStructure(['id', 'referenceNumber', 'sacrament', 'personName', 'sacramentDateText', 'details' => ['fatherName', 'motherName', 'spouseName', 'registerNumber'],
        'relationship', 'purpose', 'status', 'declineReason', 'registerEntry', 'createdAt', 'closedAt']);
    expect($res->json('status'))->toBe('submitted')
        ->and($res->json('referenceNumber'))->toMatch('/^CERT-20261102-[A-Z0-9]{4}$/')
        ->and($res->json('details'))->toBe(['fatherName' => 'Ramon Reyes', 'motherName' => 'Rosa Reyes', 'spouseName' => null, 'registerNumber' => null])
        ->and($res->json('registerEntry'))->toBeNull()
        ->and($res->json('closedAt'))->toBeNull()
        ->and($res->json())->not->toHaveKeys(['idUrl', 'letterUrl', 'requester']);

    $row = CertificateRequest::first();
    expect($row->user_id)->toBe($this->user->id)
        ->and($row->owner_snapshot)->toEqualCanonicalizing(['fullName' => 'Rita Reyes', 'email' => $this->user->email, 'phone' => '0917 000 0000']);
});

test('every field is validated', function () {
    $post = function (array $over) {
        Cache::flush(); // the throttle counters live in the cache

        return $this->actingAs($this->user)->postJson('/api/certificate-requests', certBody($this->user, $over));
    };

    $post(['sacrament' => 'anointing'])->assertJsonValidationErrors('sacrament');
    $post(['sacrament' => 'house-blessing'])->assertJsonValidationErrors('sacrament');
    $post(['personName' => ''])->assertJsonValidationErrors('personName');
    $post(['personName' => str_repeat('a', 161)])->assertJsonValidationErrors('personName');
    $post(['sacramentDateText' => ''])->assertJsonValidationErrors('sacramentDateText');
    $post(['sacramentDateText' => str_repeat('a', 61)])->assertJsonValidationErrors('sacramentDateText');
    $post(['details' => ['fatherName' => str_repeat('a', 161)]])->assertJsonValidationErrors('details.fatherName');
    $post(['details' => ['motherName' => str_repeat('a', 161)]])->assertJsonValidationErrors('details.motherName');
    $post(['details' => ['spouseName' => str_repeat('a', 161)]])->assertJsonValidationErrors('details.spouseName');
    $post(['relationship' => 'neighbour'])->assertJsonValidationErrors('relationship');
    $post(['purpose' => ''])->assertJsonValidationErrors('purpose');
    $post(['purpose' => str_repeat('a', 201)])->assertJsonValidationErrors('purpose');
    $post(['idUrl' => ''])->assertJsonValidationErrors('idUrl');
    expect(CertificateRequest::count())->toBe(0);

    foreach (['self', 'parent', 'child', 'spouse', 'sibling'] as $relationship) {
        Cache::flush(); // the throttle counters live in the cache
        $post(['relationship' => $relationship, 'details' => []])->assertCreated();
        CertificateRequest::query()->delete();
    }
});

test('details are optional', function () {
    $body = certBody($this->user);
    unset($body['details']);

    $this->actingAs($this->user)->postJson('/api/certificate-requests', $body)->assertCreated()
        ->assertJsonPath('details', ['fatherName' => null, 'motherName' => null, 'spouseName' => null, 'registerNumber' => null]);
});

test('the ID photo must be one of my own uploads that exists', function () {
    $other = User::factory()->create(['role' => 'parishioner']);

    $this->actingAs($this->user)->postJson('/api/certificate-requests', certBody($this->user, ['idUrl' => certFile($other)]))
        ->assertUnprocessable()->assertJsonValidationErrors('idUrl');
    $this->actingAs($this->user)->postJson('/api/certificate-requests', certBody($this->user, ['idUrl' => "/documents/{$this->user->id}/missing.jpg"]))
        ->assertUnprocessable()->assertJsonValidationErrors('idUrl');
    expect(CertificateRequest::count())->toBe(0);
});

test('a representative must attach an authorisation letter, and it must be theirs', function () {
    $this->actingAs($this->user)->postJson('/api/certificate-requests', certBody($this->user, ['relationship' => 'representative']))
        ->assertUnprocessable()->assertJsonValidationErrors('letterUrl');

    $other = User::factory()->create(['role' => 'parishioner']);
    $this->actingAs($this->user)->postJson('/api/certificate-requests', certBody($this->user, ['relationship' => 'representative', 'letterUrl' => certFile($other, 'letter.pdf')]))
        ->assertUnprocessable()->assertJsonValidationErrors('letterUrl');

    $this->actingAs($this->user)->postJson('/api/certificate-requests', certBody($this->user, ['relationship' => 'representative', 'letterUrl' => certFile($this->user, 'letter.pdf')]))
        ->assertCreated()->assertJsonPath('relationship', 'representative');
    expect(CertificateRequest::first()->letter_url)->toBe("/documents/{$this->user->id}/letter.pdf");
});

test('an unverified email cannot submit', function () {
    $unverified = User::factory()->unverified()->create(['role' => 'parishioner']);

    $this->actingAs($unverified)->postJson('/api/certificate-requests', certBody($unverified))->assertForbidden();
    expect(CertificateRequest::count())->toBe(0);
});

test('staff accounts and signed-out visitors cannot use the parishioner routes', function () {
    $this->postJson('/api/certificate-requests', [])->assertUnauthorized();
    $this->getJson('/api/certificate-requests')->assertUnauthorized();
    $this->getJson('/api/admin/certificate-requests')->assertUnauthorized();
    $this->actingAs($this->staff)->getJson('/api/certificate-requests')->assertForbidden();
    $this->actingAs($this->staff)->postJson('/api/certificate-requests', certBody($this->staff))->assertForbidden();
});

test('the sixth open request is refused, and a closed one frees a place', function () {
    CertificateRequest::factory()->count(5)->create(['user_id' => $this->user->id]);

    $this->actingAs($this->user)->postJson('/api/certificate-requests', certBody($this->user))
        ->assertUnprocessable()->assertExactJson(['message' => 'You already have 5 open requests.']);

    CertificateRequest::first()->update(['status' => 'declined', 'closed_at' => now()]);
    $this->actingAs($this->user)->postJson('/api/certificate-requests', certBody($this->user))->assertCreated();

    // Someone else's open requests are not mine.
    $other = User::factory()->create(['role' => 'parishioner']);
    CertificateRequest::factory()->count(5)->create(['user_id' => $other->id]);
    CertificateRequest::where('user_id', $this->user->id)->where('status', 'submitted')->first()->update(['status' => 'cancelled', 'closed_at' => now()]);
    $this->actingAs($this->user)->postJson('/api/certificate-requests', certBody($this->user))->assertCreated();
});

test('submitting has its own throttle of ten a minute', function () {
    for ($i = 0; $i < 10; $i++) {
        $this->actingAs($this->user)->postJson('/api/certificate-requests', [])->assertUnprocessable();
    }
    $this->actingAs($this->user)->postJson('/api/certificate-requests', [])->assertStatus(429);
});

test('I list and open only my own requests, newest first', function () {
    $older = certRequestFor($this->user, ['created_at' => now()->subDay()]);
    $newer = certRequestFor($this->user);
    $theirs = certRequestFor(User::factory()->create(['role' => 'parishioner']));

    $res = $this->actingAs($this->user)->getJson('/api/certificate-requests')->assertOk();
    expect(collect($res->json())->pluck('id')->all())->toBe([$newer->id, $older->id]);

    $this->actingAs($this->user)->getJson("/api/certificate-requests/{$older->id}")->assertOk()->assertJsonPath('referenceNumber', $older->reference_number);
    $this->actingAs($this->user)->getJson("/api/certificate-requests/{$theirs->id}")->assertNotFound();
});

test('a request never exposes register data before it is issued', function () {
    $request = certRequestFor($this->user);
    $entry = certEntry();

    $json = $this->actingAs($this->user)->getJson("/api/certificate-requests/{$request->id}")->assertOk()->json();
    expect($json['registerEntry'])->toBeNull()
        ->and(array_keys($json))->not->toContain('snapshot', 'subjectName', 'registerNumber', 'ceremonyDate')
        ->and(json_encode($json))->not->toContain($entry->register_number)
        ->and($this->actingAs($this->user)->getJson('/api/register-entries')->json())->toBe([]);
    $this->actingAs($this->user)->get("/api/register-entries/{$entry->id}/certificate")->assertNotFound();
});

test('I can cancel my open request and only that', function () {
    $request = certRequestFor($this->user);

    $this->actingAs($this->user)->postJson("/api/certificate-requests/{$request->id}/cancel")
        ->assertOk()->assertJsonPath('status', 'cancelled')->assertJsonPath('closedAt', now()->toIso8601String());
    expect($request->fresh()->closed_at)->not->toBeNull();
    $log = AuditLog::where('action', 'certificate_request.cancelled')->first();
    expect($log)->not->toBeNull()->and($log->subject_id)->toBe($request->id)->and($log->actor_user_id)->toBe($this->user->id);

    $this->actingAs($this->user)->postJson("/api/certificate-requests/{$request->id}/cancel")
        ->assertUnprocessable()->assertJsonPath('message', 'Only a request that is still waiting can be cancelled.');
    $issued = certRequestFor($this->user, ['status' => 'issued', 'closed_at' => now()]);
    $this->actingAs($this->user)->postJson("/api/certificate-requests/{$issued->id}/cancel")->assertUnprocessable();
    expect($issued->fresh()->status)->toBe('issued');
});

test("I cannot cancel somebody else's request", function () {
    $theirs = certRequestFor(User::factory()->create(['role' => 'parishioner']));

    $this->actingAs($this->user)->postJson("/api/certificate-requests/{$theirs->id}/cancel")->assertNotFound();
    expect($theirs->fresh()->status)->toBe('submitted');
});

test('staff list requests with filters and search, oldest open first', function () {
    $second = certRequestFor($this->user, ['created_at' => now()->subDays(2), 'person_name' => 'Pedro Penduko']);
    $first = certRequestFor($this->user, ['created_at' => now()->subDays(5), 'person_name' => 'Ana Aquino']);
    $closed = certRequestFor($this->user, ['created_at' => now()->subDays(9), 'status' => 'declined', 'decline_reason' => 'None', 'closed_at' => now()]);
    $other = User::factory()->create(['role' => 'parishioner', 'full_name' => 'Zed Zamora']);
    $third = certRequestFor($other, ['created_at' => now()->subDay()]);

    $ids = fn ($res) => collect($res->json('data'))->pluck('id')->all();

    $all = $this->actingAs($this->staff)->getJson('/api/admin/certificate-requests')->assertOk();
    expect($ids($all))->toBe([$first->id, $second->id, $third->id, $closed->id])
        ->and($all->json())->toHaveKeys(['data', 'meta', 'links']);
    expect($ids($this->actingAs($this->staff)->getJson('/api/admin/certificate-requests?status=declined')))->toBe([$closed->id]);
    expect($ids($this->actingAs($this->staff)->getJson('/api/admin/certificate-requests?status=submitted')))->toBe([$first->id, $second->id, $third->id]);
    expect($ids($this->actingAs($this->staff)->getJson('/api/admin/certificate-requests?search=penduko')))->toBe([$second->id]);
    expect($ids($this->actingAs($this->staff)->getJson('/api/admin/certificate-requests?search='.strtolower($third->reference_number))))->toBe([$third->id]);
    expect($ids($this->actingAs($this->staff)->getJson('/api/admin/certificate-requests?search=zed')))->toBe([$third->id]);
    $enye = certRequestFor($other, ['created_at' => now()->subHours(2), 'person_name' => 'Ángel Ñiguez']);
    expect($ids($this->actingAs($this->staff)->getJson('/api/admin/certificate-requests?search='.rawurlencode('ñiguez'))))->toBe([$enye->id]);
    expect($ids($this->actingAs($this->staff)->getJson('/api/admin/certificate-requests?search='.rawurlencode('ÁNGEL'))))->toBe([$enye->id]);
    $enye->delete();
    expect($ids($this->actingAs($this->admin)->getJson('/api/admin/certificate-requests?perPage=2')))->toHaveCount(2);
    $this->actingAs($this->staff)->getJson('/api/admin/certificate-requests?status=nonsense')->assertUnprocessable();
});

test('staff see the requester, the ID and the letter on a request', function () {
    $request = certRequestFor($this->user, ['id_url' => "/documents/{$this->user->id}/id.jpg", 'letter_url' => "/documents/{$this->user->id}/letter.pdf", 'relationship' => 'representative']);

    $this->actingAs($this->staff)->getJson("/api/admin/certificate-requests/{$request->id}")->assertOk()
        ->assertJsonPath('requester', ['fullName' => 'Rita Reyes', 'email' => $this->user->email, 'phone' => '0917 000 0000'])
        ->assertJsonPath('idUrl', "/documents/{$this->user->id}/id.jpg")
        ->assertJsonPath('letterUrl', "/documents/{$this->user->id}/letter.pdf")
        ->assertJsonPath('filesRemovedAt', null)
        ->assertJsonPath('handledBy', null)
        ->assertJsonPath('personName', $request->person_name);
});

test('a request whose requester deleted their account still shows who asked', function () {
    $request = certRequestFor($this->user, ['owner_snapshot' => ['fullName' => 'Rita Reyes', 'email' => 'rita@example.test', 'phone' => '0917']]);
    $this->user->delete();

    $this->actingAs($this->staff)->getJson("/api/admin/certificate-requests/{$request->id}")->assertOk()
        ->assertJsonPath('requester.fullName', 'Rita Reyes')->assertJsonPath('requester.email', 'rita@example.test');
});

test('the staff routes are for staff and admin only', function () {
    $request = certRequestFor($this->user);
    $entry = certEntry();

    $this->actingAs($this->user)->getJson('/api/admin/certificate-requests')->assertForbidden();
    $this->actingAs($this->user)->getJson("/api/admin/certificate-requests/{$request->id}")->assertForbidden();
    $this->actingAs($this->user)->postJson("/api/admin/certificate-requests/{$request->id}/issue", ['registerEntryId' => $entry->id])->assertForbidden();
    $this->actingAs($this->user)->postJson("/api/admin/certificate-requests/{$request->id}/decline", ['reason' => 'x'])->assertForbidden();
    expect($request->fresh()->status)->toBe('submitted');
});

test('issuing links the entry, notifies the requester and is audited', function () {
    $request = certRequestFor($this->user, ['purpose' => 'Marriage requirement']);
    $entry = certEntry();

    $res = $this->actingAs($this->staff)->postJson("/api/admin/certificate-requests/{$request->id}/issue", ['registerEntryId' => $entry->id])->assertOk();
    $res->assertJsonPath('status', 'issued')->assertJsonPath('registerEntry', ['id' => $entry->id, 'registerNumber' => $entry->register_number])
        ->assertJsonPath('handledBy', ['id' => $this->staff->id, 'fullName' => 'Sam Staff']);

    $row = $request->fresh();
    expect($row->status)->toBe('issued')->and($row->register_entry_id)->toBe($entry->id)->and($row->handled_by)->toBe($this->staff->id)->and($row->closed_at)->not->toBeNull();

    $note = AppNotification::where('user_id', $this->user->id)->first();
    expect($note->title)->toBe('Certificate ready')->and($note->body)->toContain($entry->register_number);
    expect(AppNotification::where('title', 'Certificate ready')->count())->toBe(1);

    $log = AuditLog::where('action', 'certificate_request.issued')->first();
    expect($log->subject_type)->toBe('certificate_request')->and($log->subject_id)->toBe($request->id)->and($log->actor_user_id)->toBe($this->staff->id)
        ->and($log->metadata['registerNumber'])->toBe($entry->register_number)->and($log->metadata['reference'])->toBe($request->reference_number);
});

test('after issue the requester lists the entry and opens the certificate with the purpose, and nobody else can', function () {
    $request = certRequestFor($this->user, ['purpose' => 'Marriage requirement']);
    $entry = certEntry();
    $stranger = User::factory()->create(['role' => 'parishioner']);

    $this->actingAs($this->staff)->postJson("/api/admin/certificate-requests/{$request->id}/issue", ['registerEntryId' => $entry->id])->assertOk();

    $list = $this->actingAs($this->user)->getJson('/api/register-entries')->assertOk()->json();
    expect($list)->toHaveCount(1)->and($list[0])->toMatchArray(['id' => $entry->id, 'registerNumber' => $entry->register_number, 'register' => 'Baptism', 'via' => 'request', 'status' => 'valid']);

    $this->actingAs($this->user)->get("/api/register-entries/{$entry->id}/certificate")
        ->assertOk()->assertSee('Issued for: Marriage requirement', false)->assertSee($entry->register_number);
    $this->actingAs($stranger)->get("/api/register-entries/{$entry->id}/certificate")->assertNotFound();
    expect($this->actingAs($stranger)->getJson('/api/register-entries')->json())->toBe([]);
});

test('a declined or cancelled request opens nothing', function () {
    $request = certRequestFor($this->user, ['status' => 'declined', 'closed_at' => now(), 'decline_reason' => 'No record']);
    $entry = certEntry();
    $request->update(['register_entry_id' => $entry->id]);

    $this->actingAs($this->user)->get("/api/register-entries/{$entry->id}/certificate")->assertNotFound();
    expect($this->actingAs($this->user)->getJson('/api/register-entries')->json())->toBe([]);
});

test('an entry reachable through my booking and a request is listed once, as a booking one, without the purpose line', function () {
    $booking = Booking::factory()->scheduled('2026-10-10', '10:00', '11:00')->create([
        'user_id' => $this->user->id, 'sacrament' => 'baptism', 'status' => 'completed',
        'form_data' => ['childFirstName' => 'Rita', 'childLastName' => 'Reyes'],
    ]);
    $entry = app(ParishRegister::class)->record($booking, $this->staff);
    $request = certRequestFor($this->user, ['purpose' => 'Passport']);
    $this->actingAs($this->staff)->postJson("/api/admin/certificate-requests/{$request->id}/issue", ['registerEntryId' => $entry->id])->assertOk();

    $list = $this->actingAs($this->user)->getJson('/api/register-entries')->json();
    expect($list)->toHaveCount(1)->and($list[0]['via'])->toBe('booking');
    $this->actingAs($this->user)->get("/api/register-entries/{$entry->id}/certificate")->assertOk()->assertDontSee('Issued for:', false);
});

test('a revoked entry cannot be issued, nor one from another register, nor to a closed request', function () {
    $request = certRequestFor($this->user, ['sacrament' => 'baptism']);
    $revoked = certEntry();
    $revoked->update(['status' => 'revoked', 'revoked_reason' => 'Issued in error', 'revoked_at' => now()]);
    $marriage = certEntry('wedding', 'Rita & Rico');
    $url = "/api/admin/certificate-requests/{$request->id}/issue";

    $this->actingAs($this->staff)->postJson($url, ['registerEntryId' => $revoked->id])->assertUnprocessable()->assertExactJson(['message' => 'That entry is revoked.']);
    $this->actingAs($this->staff)->postJson($url, ['registerEntryId' => $marriage->id])->assertUnprocessable()->assertExactJson(['message' => 'That entry is in the Marriage register.']);
    $this->actingAs($this->staff)->postJson($url, ['registerEntryId' => 'not-an-entry'])->assertUnprocessable()->assertJsonValidationErrors('registerEntryId');
    $this->actingAs($this->staff)->postJson($url, [])->assertUnprocessable()->assertJsonValidationErrors('registerEntryId');
    expect($request->fresh()->status)->toBe('submitted');

    $good = certEntry();
    $this->actingAs($this->staff)->postJson($url, ['registerEntryId' => $good->id])->assertOk();
    $this->actingAs($this->staff)->postJson($url, ['registerEntryId' => $good->id])->assertUnprocessable();
    $this->actingAs($this->staff)->postJson("/api/admin/certificate-requests/{$request->id}/decline", ['reason' => 'late'])->assertUnprocessable();

    $cancelled = certRequestFor($this->user, ['status' => 'cancelled', 'closed_at' => now()]);
    $this->actingAs($this->staff)->postJson("/api/admin/certificate-requests/{$cancelled->id}/issue", ['registerEntryId' => $good->id])->assertUnprocessable();
    expect($cancelled->fresh()->status)->toBe('cancelled')->and(AuditLog::where('action', 'certificate_request.issued')->count())->toBe(1);
});

test('staff decline with a reason, the requester is told, and it is audited', function () {
    $request = certRequestFor($this->user);
    $url = "/api/admin/certificate-requests/{$request->id}/decline";

    $this->actingAs($this->staff)->postJson($url, [])->assertUnprocessable()->assertJsonValidationErrors('reason');
    $this->actingAs($this->staff)->postJson($url, ['reason' => str_repeat('a', 501)])->assertUnprocessable()->assertJsonValidationErrors('reason');

    $this->actingAs($this->staff)->postJson($url, ['reason' => 'No record found in our books for 1998'])->assertOk()
        ->assertJsonPath('status', 'declined')->assertJsonPath('declineReason', 'No record found in our books for 1998')
        ->assertJsonPath('handledBy.fullName', 'Sam Staff');

    $row = $request->fresh();
    expect($row->status)->toBe('declined')->and($row->closed_at)->not->toBeNull()->and($row->handled_by)->toBe($this->staff->id);
    $note = AppNotification::where('user_id', $this->user->id)->first();
    expect($note->title)->toBe('Certificate request declined')->and($note->body)->toContain('No record found in our books for 1998');
    expect(AuditLog::where('action', 'certificate_request.declined')->where('subject_id', $request->id)->first()->metadata['reason'])->toBe('No record found in our books for 1998');
});

test('issuing for a requester whose account is gone does not fail', function () {
    $request = certRequestFor($this->user);
    $this->user->delete();

    $this->actingAs($this->staff)->postJson("/api/admin/certificate-requests/{$request->id}/issue", ['registerEntryId' => certEntry()->id])->assertOk();
    expect($request->fresh()->status)->toBe('issued');
});

test('files are removed thirty days after a request closes, and only when nothing else uses them', function () {
    $idUrl = certFile($this->user, 'id.jpg');
    $letterUrl = certFile($this->user, 'letter.pdf');
    $old = certRequestFor($this->user, ['status' => 'declined', 'closed_at' => now()->subDays(31), 'decline_reason' => 'x', 'id_url' => $idUrl, 'letter_url' => $letterUrl]);

    $freshId = certFile($this->user, 'fresh.jpg');
    $recent = certRequestFor($this->user, ['status' => 'issued', 'closed_at' => now()->subDays(29), 'id_url' => $freshId]);

    $openId = certFile($this->user, 'open.jpg');
    $open = certRequestFor($this->user, ['id_url' => $openId]);

    Artisan::call('certificate-requests:prune-files');

    Storage::disk('local')->assertMissing(ltrim($idUrl, '/'));
    Storage::disk('local')->assertMissing(ltrim($letterUrl, '/'));
    Storage::disk('local')->assertExists(ltrim($freshId, '/'));
    Storage::disk('local')->assertExists(ltrim($openId, '/'));
    $old = $old->fresh();
    expect($old->id_url)->toBeNull()->and($old->letter_url)->toBeNull()->and($old->files_removed_at)->not->toBeNull()
        ->and($recent->fresh()->id_url)->toBe($freshId)->and($recent->fresh()->files_removed_at)->toBeNull()
        ->and($open->fresh()->id_url)->toBe($openId);

    // A second run has nothing to do.
    Artisan::call('certificate-requests:prune-files');
    expect(AuditLog::where('action', 'certificate_requests.files_pruned')->count())->toBe(1);
});

test('a file the requester also keeps in their wallet or uses in a booking survives the clean-up', function () {
    $walletFile = certFile($this->user, 'wallet.jpg');
    WalletDocument::factory()->create(['user_id' => $this->user->id, 'file_url' => $walletFile]);
    $bookingFile = certFile($this->user, 'booked.jpg');
    Booking::factory()->create(['user_id' => $this->user->id, 'form_data' => ['birthCertificate' => $bookingFile]]);
    certRequestFor($this->user, ['status' => 'declined', 'closed_at' => now()->subDays(40), 'id_url' => $walletFile, 'letter_url' => $bookingFile]);

    Artisan::call('certificate-requests:prune-files');

    Storage::disk('local')->assertExists(ltrim($walletFile, '/'));
    Storage::disk('local')->assertExists(ltrim($bookingFile, '/'));
    $row = CertificateRequest::first();
    expect($row->id_url)->toBeNull()->and($row->files_removed_at)->not->toBeNull();
});

test('a file that an open request still uses is not deleted by another request clean-up', function () {
    $shared = certFile($this->user, 'shared.jpg');
    certRequestFor($this->user, ['status' => 'declined', 'closed_at' => now()->subDays(40), 'id_url' => $shared]);
    certRequestFor($this->user, ['id_url' => $shared]);

    Artisan::call('certificate-requests:prune-files');

    Storage::disk('local')->assertExists(ltrim($shared, '/'));
});

test('the clean-up is scheduled daily', function () {
    $event = collect(app(\Illuminate\Console\Scheduling\Schedule::class)->events())->first(fn ($e) => str_contains($e->command, 'certificate-requests:prune-files'));

    expect($event)->not->toBeNull()->and($event->expression)->toBe('0 0 * * *');
});

test('the dashboard counts open certificate requests', function () {
    certRequestFor($this->user);
    certRequestFor($this->user);
    certRequestFor($this->user, ['status' => 'issued', 'closed_at' => now()]);

    $this->actingAs($this->staff)->getJson('/api/admin/analytics')->assertOk()->assertJsonPath('attention.certificateRequests', 2);
});

test('notifying a user writes an in-app notification and nothing else', function () {
    app(\App\Services\Booking\BookingNotifier::class)->user($this->user, 'Hello', 'World');

    $note = AppNotification::where('user_id', $this->user->id)->first();
    expect($note->title)->toBe('Hello')->and($note->body)->toBe('World')->and($note->read)->toBeFalse();
});

test('staff are told when a certificate request arrives, with a link to it', function () {
    $inactive = User::factory()->create(['role' => 'staff', 'is_active' => false]);

    $res = $this->actingAs($this->user)->postJson('/api/certificate-requests', certBody($this->user))->assertCreated();
    $id = $res->json('id');

    foreach ([$this->staff, $this->admin] as $who) {
        $n = AppNotification::where('user_id', $who->id)->first();
        expect($n)->not->toBeNull()
            ->and($n->title)->toBe('New certificate request')
            ->and($n->body)->toContain('Rita Reyes')
            ->and($n->link)->toBe("/certificate-requests/{$id}")
            ->and($n->booking_id)->toBeNull();
    }
    expect(AppNotification::where('user_id', $inactive->id)->count())->toBe(0)
        ->and(AppNotification::where('user_id', $this->user->id)->count())->toBe(0);
});

test('a refused request alerts nobody', function () {
    $this->actingAs($this->user)->postJson('/api/certificate-requests', certBody($this->user, ['purpose' => '']))->assertUnprocessable();
    expect(AppNotification::count())->toBe(0);
});

test('the notification list exposes the link', function () {
    $this->actingAs($this->user)->postJson('/api/certificate-requests', certBody($this->user))->assertCreated();
    $id = CertificateRequest::first()->id;
    $res = $this->actingAs($this->staff)->getJson('/api/notifications')->assertOk();
    expect($res->json('0.link'))->toBe("/certificate-requests/{$id}");
});

test('a failed staff alert is logged and does not fail the request', function () {
    $this->app->bind(\App\Services\Booking\BookingNotifier::class, fn () => new class extends \App\Services\Booking\BookingNotifier
    {
        public function __construct() {}

        public function staff(string $title, string $body, ?Booking $booking = null, ?string $link = null): void
        {
            throw new \RuntimeException('mail is down');
        }
    });
    \Illuminate\Support\Facades\Log::spy();

    $this->actingAs($this->user)->postJson('/api/certificate-requests', certBody($this->user))->assertCreated();

    expect(CertificateRequest::where('user_id', $this->user->id)->count())->toBe(1);
    \Illuminate\Support\Facades\Log::shouldHaveReceived('error')->once();
});

test('a register number names the record, so the name and date are not asked again', function () {
    $entry = certEntry('baptism', 'Rita Reyes');
    $body = ['sacrament' => 'baptism', 'registerNumber' => strtolower($entry->register_number), 'relationship' => 'self', 'purpose' => 'Marriage requirement', 'idUrl' => certFile($this->user)];

    $res = $this->actingAs($this->user)->postJson('/api/certificate-requests', $body)->assertCreated();

    expect($res->json('personName'))->toBe('Rita Reyes')
        ->and($res->json('sacramentDateText'))->toBe($entry->ceremony_date->format('F j, Y'))
        ->and($res->json('details.registerNumber'))->toBe($entry->register_number);
});

test('a register number that matches no valid record of that certificate is refused', function () {
    $entry = certEntry('baptism');
    $body = fn (array $over) => $over + ['sacrament' => 'baptism', 'relationship' => 'self', 'purpose' => 'x', 'idUrl' => certFile($this->user)];

    $this->actingAs($this->user)->postJson('/api/certificate-requests', $body(['registerNumber' => 'BAP-1999-9999']))->assertUnprocessable()->assertJsonValidationErrors('registerNumber');
    // Right number, wrong certificate.
    $this->actingAs($this->user)->postJson('/api/certificate-requests', $body(['sacrament' => 'wedding', 'registerNumber' => $entry->register_number]))->assertUnprocessable()->assertJsonValidationErrors('registerNumber');
    // Neither a number nor a name and date.
    $this->actingAs($this->user)->postJson('/api/certificate-requests', $body([]))->assertUnprocessable()->assertJsonValidationErrors(['personName', 'sacramentDateText']);
});
