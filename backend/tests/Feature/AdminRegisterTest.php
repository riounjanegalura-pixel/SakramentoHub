<?php

use App\Models\AuditLog;
use App\Models\Booking;
use App\Models\RegisterEntry;
use App\Models\User;
use App\Services\Register\ParishRegister;
use Database\Seeders\ParishSettingSeeder;
use Database\Seeders\ServiceSeeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\RateLimiter;

beforeEach(function () {
    $this->seed(ServiceSeeder::class);
    $this->seed(ParishSettingSeeder::class);
    Carbon::setTestNow(Carbon::parse('2026-11-02 00:00:00', 'UTC'));
    RateLimiter::clear('certificate-verify');
    $this->staff = User::factory()->create(['role' => 'staff', 'full_name' => 'Sam Staff']);
    $this->admin = User::factory()->create(['role' => 'admin', 'full_name' => 'Ada Admin']);
});
afterEach(fn () => Carbon::setTestNow());

function systemEntry(string $name = 'Maria Santos', string $sacrament = 'baptism', string $date = '2026-10-10'): RegisterEntry
{
    $booking = Booking::factory()->scheduled($date, '10:00', '11:00')->create([
        'sacrament' => $sacrament, 'status' => 'completed',
        'form_data' => ['childFirstName' => explode(' ', $name)[0], 'childLastName' => explode(' ', $name)[1] ?? 'X', 'motherFirstName' => 'Ana', 'motherLastName' => 'Santos'],
    ]);

    return app(ParishRegister::class)->record($booking, test()->staff);
}

function transcribeBody(array $over = []): array
{
    return $over + [
        'sacrament' => 'baptism', 'ceremonyDate' => '1998-05-17', 'subjectName' => 'Jose Rizal Jr.',
        'minister' => 'Rev. Fr. Old Priest',
        'details' => [['label' => 'Father', 'value' => 'Jose Rizal'], ['label' => 'Mother', 'value' => '  '], ['label' => 'Sponsors', 'value' => 'A, B']],
        'bookNo' => '7', 'pageNo' => '112', 'lineNo' => '3',
    ];
}

test('list is newest first, paginated, and filters and searches', function () {
    $a = systemEntry('Maria Santos');
    $b = systemEntry('Pedro Cruz', 'baptism', '2026-10-11');
    $c = systemEntry('Lorenzo Pascual', 'funeral', '2026-10-12');
    $b->update(['status' => 'revoked']);
    $transcribed = RegisterEntry::factory()->create(['sacrament' => 'wedding', 'year' => 2001, 'sequence' => 1, 'source' => 'transcribed', 'subject_name' => 'Old Couple']);

    $all = $this->actingAs($this->staff)->getJson('/api/admin/register')->assertOk();
    expect($all->json('data'))->toHaveCount(4)->and($all->json('data.0.id'))->toBe($transcribed->id)
        ->and($all->json('meta.total'))->toBe(4);

    $q = fn (string $qs) => collect($this->actingAs($this->staff)->getJson("/api/admin/register?{$qs}")->assertOk()->json('data'))->pluck('registerNumber')->all();
    expect($q('sacrament=funeral'))->toBe([$c->register_number])
        ->and($q('year=2001'))->toBe([$transcribed->register_number])
        ->and($q('status=revoked'))->toBe([$b->register_number])
        ->and($q('source=transcribed'))->toBe([$transcribed->register_number])
        ->and($q('search=maria'))->toBe([$a->register_number])
        ->and($q('search='.strtolower($c->register_number)))->toBe([$c->register_number]);
    expect($this->actingAs($this->staff)->getJson('/api/admin/register?perPage=2')->json('data'))->toHaveCount(2);
    $this->actingAs($this->staff)->getJson('/api/admin/register?perPage=101')->assertStatus(422);
    $this->actingAs($this->staff)->getJson('/api/admin/register?status=nope')->assertStatus(422);
});

test('an entry shows the resource shape and its history', function () {
    $e = systemEntry();

    $res = $this->actingAs($this->staff)->getJson("/api/admin/register/{$e->id}")->assertOk();

    $res->assertJsonPath('registerNumber', 'BAP-2026-0001')->assertJsonPath('register', 'Baptism')
        ->assertJsonPath('year', 2026)->assertJsonPath('sequence', 1)->assertJsonPath('source', 'system')
        ->assertJsonPath('status', 'valid')->assertJsonPath('ceremonyDate', '2026-10-10')
        ->assertJsonPath('verifiable', true)->assertJsonPath('verifyCode', ParishRegister::formatCode($e->verify_code))
        ->assertJsonPath('bookingId', $e->booking_id)->assertJsonPath('bookingReference', $e->booking->reference_number)
        ->assertJsonPath('enteredBy.fullName', 'Sam Staff')->assertJsonPath('bookNo', null)
        ->assertJsonPath('snapshot.subjectName', 'Maria Santos')->assertJsonPath('history.0.action', 'register.recorded');
    expect($res->json('verifyUrl'))->toContain("/verify/{$e->register_number}/")
        ->and($res->json())->toHaveKeys(['id', 'lineNo', 'pageNo', 'revokedReason', 'revokedAt', 'correctedAt', 'enteredAt']);
    $this->actingAs($this->staff)->getJson('/api/admin/register/'.\Illuminate\Support\Str::uuid())->assertNotFound();
});

test('an anointing entry is not verifiable', function () {
    $e = systemEntry('Ana Reyes', 'anointing');

    $this->actingAs($this->staff)->getJson("/api/admin/register/{$e->id}")->assertOk()
        ->assertJsonPath('verifiable', false)->assertJsonPath('verifyCode', null)->assertJsonPath('verifyUrl', null);
});

test('the admin can open the certificate from the register', function () {
    $e = systemEntry();

    $res = $this->actingAs($this->staff)->get("/api/admin/register/{$e->id}/certificate")->assertOk();

    expect($res->headers->get('Content-Type'))->toContain('text/html')->and($res->getContent())->toContain($e->register_number);
});

test('transcribing a paper entry numbers it in the ceremony year and leaves the current series alone', function () {
    $res = $this->actingAs($this->staff)->postJson('/api/admin/register', transcribeBody())->assertCreated();

    $res->assertJsonPath('registerNumber', 'BAP-1998-0001')->assertJsonPath('source', 'transcribed')
        ->assertJsonPath('year', 1998)->assertJsonPath('bookNo', '7')->assertJsonPath('lineNo', '3')
        ->assertJsonPath('bookingId', null)->assertJsonPath('verifiable', true)
        ->assertJsonPath('snapshot.title', 'Certificate of Baptism')->assertJsonPath('snapshot.minister', 'Rev. Fr. Old Priest')
        ->assertJsonPath('snapshot.parishName', 'St. Peter the Apostle Parish')->assertJsonPath('snapshot.parishAddress', 'Balagtas, Bulacan')
        ->assertJsonPath('snapshot.statement', 'was baptized according to the Rite of the Roman Catholic Church.')
        ->assertJsonPath('enteredBy.fullName', 'Sam Staff');
    expect($res->json('snapshot.details'))->toBe([['label' => 'Father', 'value' => 'Jose Rizal'], ['label' => 'Sponsors', 'value' => 'A, B']])
        ->and($res->json('verifyCode'))->toMatch('/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/');
    expect(DB::table('register_sequences')->where('year', 2026)->count())->toBe(0);
    $log = AuditLog::where('action', 'register.transcribed')->sole();
    expect($log->subject_type)->toBe('register_entry')->and($log->subject_id)->toBe($res->json('id'));

    $next = systemEntry();
    expect($next->register_number)->toBe('BAP-2026-0001');
});

test('transcribe validates its input', function (array $over, string $field) {
    $this->actingAs($this->staff)->postJson('/api/admin/register', transcribeBody($over))
        ->assertStatus(422)->assertJsonValidationErrors([$field]);
})->with([
    'future date' => [['ceremonyDate' => '2026-11-04'], 'ceremonyDate'],
    'not canonical' => [['sacrament' => 'anointing'], 'sacrament'],
    'house blessing' => [['sacrament' => 'house-blessing'], 'sacrament'],
    'no book' => [['bookNo' => ''], 'bookNo'],
    'no page' => [['pageNo' => null], 'pageNo'],
    'no name' => [['subjectName' => ''], 'subjectName'],
    'long name' => [['subjectName' => str_repeat('a', 161)], 'subjectName'],
    'no minister' => [['minister' => ''], 'minister'],
    'too many details' => [['details' => array_fill(0, 13, ['label' => 'L', 'value' => 'V'])], 'details'],
    'long label' => [['details' => [['label' => str_repeat('a', 61), 'value' => 'V']]], 'details.0.label'],
]);

test('today is an acceptable ceremony date', function () {
    $this->actingAs($this->staff)->postJson('/api/admin/register', transcribeBody(['ceremonyDate' => '2026-11-02']))->assertCreated();
});

test('the same paper line twice is refused, with a null line equal to a null line', function () {
    $first = $this->actingAs($this->staff)->postJson('/api/admin/register', transcribeBody(['lineNo' => null]))->assertCreated();

    $this->actingAs($this->staff)->postJson('/api/admin/register', transcribeBody(['lineNo' => null, 'subjectName' => 'Someone Else']))
        ->assertStatus(422)->assertJsonPath('message', "This book entry is already in the register as {$first->json('registerNumber')}.");

    // A different line on the same page, or the same line in another register, is fine.
    $this->actingAs($this->staff)->postJson('/api/admin/register', transcribeBody(['lineNo' => '1', 'subjectName' => 'Someone Else']))->assertCreated();
    $this->actingAs($this->staff)->postJson('/api/admin/register', transcribeBody(['sacrament' => 'confirmation', 'lineNo' => null, 'subjectName' => 'Third']))->assertCreated();
    expect(RegisterEntry::count())->toBe(3);
});

test('the same sacrament, date and name is a 409 until confirmed', function () {
    $first = $this->actingAs($this->staff)->postJson('/api/admin/register', transcribeBody())->assertCreated();
    $again = transcribeBody(['subjectName' => 'JOSE RIZAL JR.', 'lineNo' => '4']);

    $res = $this->actingAs($this->staff)->postJson('/api/admin/register', $again)->assertStatus(409);
    $res->assertJsonPath('duplicates.0.id', $first->json('id'))->assertJsonPath('duplicates.0.registerNumber', 'BAP-1998-0001');
    expect($res->json('message'))->toBeString()->and(RegisterEntry::count())->toBe(1);

    $this->actingAs($this->staff)->postJson('/api/admin/register', $again + ['confirmDuplicate' => true])
        ->assertCreated()->assertJsonPath('registerNumber', 'BAP-1998-0002');
});

test('a duplicate paper line is still refused when the duplicate is confirmed', function () {
    $this->actingAs($this->staff)->postJson('/api/admin/register', transcribeBody())->assertCreated();

    $this->actingAs($this->staff)->postJson('/api/admin/register', transcribeBody(['confirmDuplicate' => true]))->assertStatus(422);
});

test('a name duplicate also catches a system entry', function () {
    $e = systemEntry('Maria Santos', 'baptism', '2026-10-10');

    $this->actingAs($this->staff)->postJson('/api/admin/register', transcribeBody(['ceremonyDate' => '2026-10-10', 'subjectName' => 'maria santos']))
        ->assertStatus(409)->assertJsonPath('duplicates.0.registerNumber', $e->register_number);
});

test('correcting keeps the number and code, records before and after, and the certificate and verify show it', function () {
    $e = systemEntry('Maria Santos');
    $code = $e->verify_code;

    $res = $this->actingAs($this->admin)->patchJson("/api/admin/register/{$e->id}", [
        'reason' => 'Misspelt on the form', 'subjectName' => 'Maria Clara Santos', 'ceremonyDate' => '2026-10-09', 'minister' => 'Rev. Fr. Other',
    ])->assertOk();

    $res->assertJsonPath('registerNumber', $e->register_number)->assertJsonPath('verifyCode', ParishRegister::formatCode($code))
        ->assertJsonPath('subjectName', 'Maria Clara Santos')->assertJsonPath('ceremonyDate', '2026-10-09')
        ->assertJsonPath('snapshot.subjectName', 'Maria Clara Santos')->assertJsonPath('snapshot.minister', 'Rev. Fr. Other');
    expect($res->json('correctedAt'))->not->toBeNull()
        ->and($res->json('snapshot.statement'))->toContain('October 9, 2026')->not->toContain('October 10, 2026');
    expect(collect($res->json('snapshot.details'))->pluck('value')->all())->toContain('October 9, 2026')->not->toContain('October 10, 2026');
    $log = AuditLog::where('action', 'register.corrected')->sole();
    expect($log->metadata['reason'])->toBe('Misspelt on the form')
        ->and($log->metadata['before']['subjectName'])->toBe('Maria Santos')
        ->and($log->metadata['after']['subjectName'])->toBe('Maria Clara Santos')
        ->and($log->metadata['before']['ceremonyDate'])->toBe('2026-10-10');

    $this->actingAs($this->admin)->get("/api/admin/register/{$e->id}/certificate")->assertSee('Maria Clara Santos');
    $this->postJson('/api/verify', ['number' => $e->register_number, 'code' => $code])
        ->assertOk()->assertJsonPath('subjectName', 'Maria Clara Santos')->assertJsonPath('correctedOn', '2026-11-02')
        ->assertJsonPath('ceremonyDate', '2026-10-09');
});

test('correction can replace the detail rows and needs a reason and a change', function () {
    $e = systemEntry();

    $this->actingAs($this->admin)->patchJson("/api/admin/register/{$e->id}", ['subjectName' => 'X'])->assertStatus(422)->assertJsonValidationErrors(['reason']);
    $this->actingAs($this->admin)->patchJson("/api/admin/register/{$e->id}", ['reason' => 'why'])->assertStatus(422);
    $this->actingAs($this->admin)->patchJson("/api/admin/register/{$e->id}", ['reason' => 'why', 'ceremonyDate' => '2027-01-01'])->assertStatus(422)->assertJsonValidationErrors(['ceremonyDate']);

    $res = $this->actingAs($this->admin)->patchJson("/api/admin/register/{$e->id}", [
        'reason' => 'Fix godparents', 'details' => [['label' => 'Godparents', 'value' => 'Pedro Reyes'], ['label' => 'Blank', 'value' => '']],
    ])->assertOk();
    expect($res->json('snapshot.details'))->toBe([['label' => 'Godparents', 'value' => 'Pedro Reyes']]);
});

test('a correction that changes nothing is refused and leaves the entry uncorrected', function () {
    $e = systemEntry('Maria Santos', 'baptism', '2026-10-10');
    $same = ['reason' => 'Looks wrong', 'subjectName' => 'Maria Santos', 'ceremonyDate' => '2026-10-10', 'minister' => $e->snapshot['minister'], 'details' => $e->snapshot['details']];

    $this->actingAs($this->admin)->patchJson("/api/admin/register/{$e->id}", $same)
        ->assertStatus(422)->assertExactJson(['message' => 'Nothing was changed.']);

    expect($e->fresh()->corrected_at)->toBeNull()->and(AuditLog::where('action', 'register.corrected')->count())->toBe(0);
});

test('a ceremony date before 1500 is refused on transcribe and correct, with a message about the year', function () {
    $e = systemEntry();

    $this->actingAs($this->staff)->postJson('/api/admin/register', transcribeBody(['ceremonyDate' => '0026-05-01']))
        ->assertStatus(422)->assertJsonValidationErrors(['ceremonyDate'])->assertJsonPath('errors.ceremonyDate.0', 'Check the year of the ceremony date.');
    $this->actingAs($this->admin)->patchJson("/api/admin/register/{$e->id}", ['reason' => 'typo', 'ceremonyDate' => '0026-05-01'])
        ->assertStatus(422)->assertJsonPath('errors.ceremonyDate.0', 'Check the year of the ceremony date.');
    // 1500 itself is the first accepted day.
    $this->actingAs($this->staff)->postJson('/api/admin/register', transcribeBody(['ceremonyDate' => '1500-01-01']))->assertCreated();
});

test('a revoked entry cannot be corrected', function () {
    $e = systemEntry();
    $e->update(['status' => 'revoked']);

    $this->actingAs($this->admin)->patchJson("/api/admin/register/{$e->id}", ['reason' => 'x', 'subjectName' => 'Y'])->assertStatus(422);
});

test('correct, revoke and reinstate are admin only; staff are forbidden and parishioners cannot reach any route', function () {
    $e = systemEntry();
    $parishioner = User::factory()->create();

    foreach ([
        ['patchJson', "/api/admin/register/{$e->id}", ['reason' => 'r', 'subjectName' => 'Z']],
        ['postJson', "/api/admin/register/{$e->id}/revoke", ['reason' => 'r']],
        ['postJson', "/api/admin/register/{$e->id}/reinstate", ['reason' => 'r']],
    ] as [$method, $url, $body]) {
        $this->actingAs($this->staff)->{$method}($url, $body)->assertForbidden();
    }

    foreach ([
        ['getJson', '/api/admin/register'], ['getJson', "/api/admin/register/{$e->id}"], ['getJson', "/api/admin/register/{$e->id}/certificate"],
        ['postJson', '/api/admin/register', transcribeBody()], ['patchJson', "/api/admin/register/{$e->id}", ['reason' => 'r', 'subjectName' => 'Z']],
        ['patchJson', "/api/admin/register/{$e->id}/paper-reference", ['bookNo' => '1', 'pageNo' => '1']],
        ['postJson', "/api/admin/register/{$e->id}/revoke", ['reason' => 'r']], ['postJson', "/api/admin/register/{$e->id}/reinstate", ['reason' => 'r']],
    ] as $call) {
        $this->actingAs($parishioner)->{$call[0]}($call[1], $call[2] ?? [])->assertForbidden();
    }
    expect($e->fresh()->status)->toBe('valid')->and($e->fresh()->corrected_at)->toBeNull();
});

test('staff can set the paper reference, the unique rule applies, and it is audited', function () {
    $e = systemEntry();
    $other = systemEntry('Pedro Cruz', 'baptism', '2026-10-11');

    $res = $this->actingAs($this->staff)->patchJson("/api/admin/register/{$e->id}/paper-reference", ['bookNo' => '12', 'pageNo' => '34', 'lineNo' => null])->assertOk();
    $res->assertJsonPath('bookNo', '12')->assertJsonPath('pageNo', '34')->assertJsonPath('lineNo', null);
    $log = AuditLog::where('action', 'register.paper_reference')->sole();
    expect($log->metadata['before']['bookNo'])->toBeNull()->and($log->metadata['after']['bookNo'])->toBe('12');

    $this->actingAs($this->staff)->patchJson("/api/admin/register/{$other->id}/paper-reference", ['bookNo' => '12', 'pageNo' => '34'])
        ->assertStatus(422)->assertJsonPath('message', "This book entry is already in the register as {$e->register_number}.");
    // Setting the same value on the same entry is not a clash with itself.
    $this->actingAs($this->staff)->patchJson("/api/admin/register/{$e->id}/paper-reference", ['bookNo' => '12', 'pageNo' => '34'])->assertOk();
    // Clearing it is allowed.
    $this->actingAs($this->staff)->patchJson("/api/admin/register/{$e->id}/paper-reference", ['bookNo' => null, 'pageNo' => null, 'lineNo' => null])->assertOk()->assertJsonPath('bookNo', null);
    $this->actingAs($this->staff)->patchJson("/api/admin/register/{$e->id}/paper-reference", ['bookNo' => str_repeat('a', 21)])->assertStatus(422);
});

test('revoke then verify says revoked, reinstate restores, and both need a reason and the right state', function () {
    $e = systemEntry();
    $verify = fn () => $this->postJson('/api/verify', ['number' => $e->register_number, 'code' => $e->verify_code]);

    $this->actingAs($this->admin)->postJson("/api/admin/register/{$e->id}/revoke", [])->assertStatus(422)->assertJsonValidationErrors(['reason']);
    $res = $this->actingAs($this->admin)->postJson("/api/admin/register/{$e->id}/revoke", ['reason' => 'Issued in error'])->assertOk();
    $res->assertJsonPath('status', 'revoked')->assertJsonPath('revokedReason', 'Issued in error');
    expect($res->json('revokedAt'))->not->toBeNull();
    $verify()->assertOk()->assertJsonPath('status', 'revoked');
    $this->actingAs($this->admin)->postJson("/api/admin/register/{$e->id}/revoke", ['reason' => 'again'])->assertStatus(422);

    $back = $this->actingAs($this->admin)->postJson("/api/admin/register/{$e->id}/reinstate", ['reason' => 'Found the paperwork'])->assertOk();
    $back->assertJsonPath('status', 'valid')->assertJsonPath('revokedReason', null)->assertJsonPath('revokedAt', null);
    $verify()->assertOk()->assertJsonPath('status', 'valid');
    $this->actingAs($this->admin)->postJson("/api/admin/register/{$e->id}/reinstate", ['reason' => 'again'])->assertStatus(422);
    $this->actingAs($this->admin)->postJson("/api/admin/register/{$e->id}/reinstate", [])->assertStatus(422);
});

test('history lists the actions in order with who did them', function () {
    $e = systemEntry();
    $this->actingAs($this->staff)->patchJson("/api/admin/register/{$e->id}/paper-reference", ['bookNo' => '1', 'pageNo' => '2'])->assertOk();
    $this->actingAs($this->admin)->patchJson("/api/admin/register/{$e->id}", ['reason' => 'typo', 'subjectName' => 'Maria S'])->assertOk();
    $this->actingAs($this->admin)->postJson("/api/admin/register/{$e->id}/revoke", ['reason' => 'void'])->assertOk();
    $this->actingAs($this->admin)->postJson("/api/admin/register/{$e->id}/reinstate", ['reason' => 'ok'])->assertOk();
    // Make created_at strictly ordered even inside one test second.
    AuditLog::where('subject_id', $e->id)->orderBy('id')->get()->each(fn ($l, $i) => $l->update(['created_at' => now()->addSeconds($i)]));

    $history = $this->actingAs($this->staff)->getJson("/api/admin/register/{$e->id}")->json('history');

    expect(collect($history)->pluck('action')->all())->toBe(['register.recorded', 'register.paper_reference', 'register.corrected', 'register.revoked', 'register.reinstated'])
        ->and($history[2]['actor']['fullName'])->toBe('Ada Admin')->and($history[1]['actor']['fullName'])->toBe('Sam Staff')
        ->and($history[0])->toHaveKeys(['id', 'action', 'subjectType', 'subjectId', 'metadata', 'actor', 'createdAt']);
});

// SQLite's LOWER() only folds A–Z, so a name beginning with Ñ or an accented capital could not be found by typing it.
test('search finds a name with Ñ or an accented capital however it is typed', function () {
    $e = RegisterEntry::factory()->create(['sacrament' => 'baptism', 'year' => 2026, 'sequence' => 41, 'subject_name' => 'José Miguel Ñiguez']);
    $caps = RegisterEntry::factory()->create(['sacrament' => 'baptism', 'year' => 2026, 'sequence' => 42, 'subject_name' => 'MARIA PEÑA']);
    RegisterEntry::factory()->create(['sacrament' => 'baptism', 'year' => 2026, 'sequence' => 43, 'subject_name' => 'Pedro Cruz']);

    $q = fn (string $term) => collect($this->actingAs($this->staff)->getJson('/api/admin/register?search='.rawurlencode($term))->assertOk()->json('data'))->pluck('id')->all();

    expect($q('Ñiguez'))->toBe([$e->id])
        ->and($q('ñiguez'))->toBe([$e->id])
        ->and($q('ÑIGUEZ'))->toBe([$e->id])
        ->and($q('JOSÉ'))->toBe([$e->id])
        ->and($q('josé miguel'))->toBe([$e->id])
        ->and($q('peña'))->toBe([$caps->id])
        ->and($q('Peña'))->toBe([$caps->id])
        ->and($q('100%'))->toBe([]);
});

test('the name duplicate warning also sees a name with Ñ typed in another case', function () {
    $this->actingAs($this->staff)->postJson('/api/admin/register', transcribeBody(['subjectName' => 'Ñiguez, José']))->assertCreated();

    $this->actingAs($this->staff)->postJson('/api/admin/register', transcribeBody(['subjectName' => 'ñiguez, josé', 'lineNo' => '4']))->assertStatus(409);
    $this->actingAs($this->staff)->postJson('/api/admin/register', transcribeBody(['subjectName' => 'ÑIGUEZ, JOSÉ', 'lineNo' => '5']))->assertStatus(409);
});
