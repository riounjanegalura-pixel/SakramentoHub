<?php

use App\Models\Booking;
use App\Models\ParishSetting;
use App\Models\RegisterEntry;
use App\Models\User;
use App\Services\Register\CertificateRenderer;
use App\Services\Register\ParishRegister;
use Database\Seeders\ParishSettingSeeder;
use Database\Seeders\ServiceSeeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Storage;

beforeEach(function () {
    $this->seed(ServiceSeeder::class);
    $this->seed(ParishSettingSeeder::class);
    Storage::fake('local');
    Carbon::setTestNow(Carbon::parse('2026-11-02 00:00:00', 'UTC'));
    config(['app.parishioner_url' => 'https://parish.example.test']);
    $this->staff = User::factory()->create(['role' => 'staff']);
    $this->owner = User::factory()->create();
});
afterEach(fn () => Carbon::setTestNow());

function entryFor(string $sacrament = 'baptism'): RegisterEntry
{
    $booking = Booking::factory()->scheduled('2026-10-10', '10:00', '11:00')->create([
        'user_id' => test()->owner->id, 'sacrament' => $sacrament, 'status' => 'completed',
        'form_data' => ['childFirstName' => 'Maria', 'childLastName' => 'Santos', 'motherFirstName' => 'Ana', 'motherLastName' => 'Santos'],
    ]);

    return app(ParishRegister::class)->record($booking, test()->staff);
}

test('admin and owner get the certificate with number, name, formatted code, QR and verify URL', function () {
    $entry = entryFor();
    $code = ParishRegister::formatCode($entry->verify_code);

    foreach ([
        [$this->staff, "/api/admin/bookings/{$entry->booking_id}/certificate"],
        [$this->owner, "/api/bookings/{$entry->booking_id}/certificate"],
        [$this->owner, "/api/register-entries/{$entry->id}/certificate"],
    ] as [$who, $url]) {
        $res = $this->actingAs($who)->get($url);
        $res->assertOk();
        expect($res->headers->get('Content-Type'))->toContain('text/html')
            ->and($res->headers->get('Cache-Control'))->toContain('no-store');
        expect($res->getContent())->toContain($entry->register_number)->toContain('Maria Santos')->toContain($code)
            ->toContain('<svg')->toContain('Verify at parish.example.test/verify');
    }
    expect(app(CertificateRenderer::class)->verifyUrl($entry))->toBe("https://parish.example.test/verify/{$entry->register_number}/{$code}");
});

test('an anointing certificate has no QR and no code', function () {
    $entry = entryFor('anointing');

    $html = $this->actingAs($this->staff)->get("/api/admin/bookings/{$entry->booking_id}/certificate")->getContent();

    expect($entry->verify_code)->toBeNull();
    expect($html)->not->toContain('<svg')->not->toContain('Verify at')->toContain($entry->register_number);
});

test('a revoked certificate shows REVOKED and no QR', function () {
    $entry = entryFor();
    $entry->update(['status' => 'revoked']);

    $html = $this->actingAs($this->staff)->get("/api/admin/bookings/{$entry->booking_id}/certificate")->getContent();

    expect($html)->toContain('REVOKED')->not->toContain('<svg');
});

test('the paper reference line appears only when set', function () {
    $entry = entryFor();
    $renderer = app(CertificateRenderer::class);
    expect($renderer->html($entry))->not->toContain('Book ');

    $entry->update(['book_no' => '12', 'page_no' => '34']);
    expect($renderer->html($entry->fresh()))->toContain('Book 12, Page 34')->not->toContain('No. 12');

    $entry->update(['line_no' => '5']);
    expect($renderer->html($entry->fresh()))->toContain('Book 12, Page 34, No. 5');
});

test('the purpose line appears only when passed', function () {
    $entry = entryFor();
    $renderer = app(CertificateRenderer::class);

    expect($renderer->html($entry))->not->toContain('Issued for')
        ->and($renderer->html($entry, 'Marriage requirements'))->toContain('Issued for: Marriage requirements')
        ->and($renderer->html($entry))->toContain('Date issued: November 2, 2026'); // under the priest's signature
});

test('snapshot values are escaped', function () {
    $entry = entryFor();
    $snapshot = $entry->snapshot;
    $snapshot['subjectName'] = '<script>alert(1)</script>';
    $snapshot['details'][] = ['label' => '<b>L</b>', 'value' => '"><img src=x onerror=1>'];
    $entry->update(['snapshot' => $snapshot]);

    $html = app(CertificateRenderer::class)->html($entry->fresh());

    expect($html)->not->toContain('<script>alert(1)')->not->toContain('<img src=x')->not->toContain('<b>L</b>')
        ->toContain('&lt;script&gt;');
});

test('another parishioner gets 404 and a booking with no entry gets 404', function () {
    $entry = entryFor();
    $intruder = User::factory()->create();
    $open = Booking::factory()->create(['user_id' => $this->owner->id, 'sacrament' => 'funeral', 'status' => 'approved']);

    $this->actingAs($intruder)->getJson("/api/bookings/{$entry->booking_id}/certificate")->assertNotFound();
    $this->actingAs($intruder)->getJson("/api/register-entries/{$entry->id}/certificate")->assertNotFound();
    $this->actingAs($this->owner)->getJson("/api/bookings/{$open->id}/certificate")->assertNotFound()->assertJsonPath('message', 'No certificate yet.');
    $this->actingAs($this->staff)->getJson("/api/admin/bookings/{$open->id}/certificate")->assertNotFound()->assertJsonPath('message', 'No certificate yet.');
});

test('the entry certificate needs a signed-in user', function () {
    $entry = entryFor();

    $this->getJson("/api/register-entries/{$entry->id}/certificate")->assertUnauthorized();
});

test('a transcribed entry with no booking is not served by the parishioner route', function () {
    $entry = entryFor();
    $entry->update(['booking_id' => null, 'source' => 'transcribed']);

    $this->actingAs($this->owner)->getJson("/api/register-entries/{$entry->id}/certificate")->assertNotFound();
});

test('the generate route is gone and no certificate file is written', function () {
    $entry = entryFor();
    $stored = fn () => glob(storage_path('app/private/certificates/*')) ?: [];
    $filesBefore = $stored();

    $this->actingAs($this->staff)->postJson("/api/admin/bookings/{$entry->booking_id}/certificate")->assertStatus(405);
    $this->actingAs($this->staff)->get("/api/admin/bookings/{$entry->booking_id}/certificate")->assertOk();

    expect(Storage::disk('local')->allFiles())->toBe([])
        ->and($stored())->toBe($filesBefore);
});

test('changing the parish name after completion does not change the certificate', function () {
    $entry = entryFor();
    $before = $this->actingAs($this->staff)->get("/api/admin/bookings/{$entry->booking_id}/certificate")->getContent();

    // Through the model, as the settings screen saves them: the JSON cast encodes the strings.
    ParishSetting::put('parish_name', 'Somewhere Else Parish');
    ParishSetting::put('parish_address', 'Elsewhere');

    $after = $this->actingAs($this->staff)->get("/api/admin/bookings/{$entry->booking_id}/certificate")->getContent();

    expect($after)->toBe($before)->not->toContain('Somewhere Else Parish');
});

// A copy of a 1998 baptism printed with neither the date of baptism nor the minister: the transcription
// form asks for both, but they are not detail rows, and only detail rows were printed.
test('a transcribed entry prints its ceremony date and minister even though they are not detail rows', function () {
    $entry = app(ParishRegister::class)->transcribe([
        'sacrament' => 'baptism', 'ceremonyDate' => '1998-05-17', 'subjectName' => 'Rosa Maria Santos', 'minister' => 'Rev. Fr. Anselmo Cruz',
        'details' => [['label' => 'Father', 'value' => 'Ramon Santos']], 'bookNo' => '7', 'pageNo' => '112', 'lineNo' => '3',
    ], $this->staff);

    $html = app(CertificateRenderer::class)->html($entry);

    expect($html)->toContain('Date of Baptism')->toContain('May 17, 1998')
        ->toContain('Minister')->toContain('Rev. Fr. Anselmo Cruz')
        ->and($entry->fresh()->snapshot['details'])->toBe([['label' => 'Father', 'value' => 'Ramon Santos']]);

    // After a correction the paper follows the corrected record.
    $admin = User::factory()->create(['role' => 'admin']);
    app(ParishRegister::class)->correct($entry, ['ceremonyDate' => '1998-05-24', 'minister' => 'Rev. Fr. Benito Ramos'], 'Misread the book', $admin);
    $html = app(CertificateRenderer::class)->html($entry->fresh());
    expect($html)->toContain('May 24, 1998')->not->toContain('May 17, 1998')
        ->toContain('Rev. Fr. Benito Ramos')->not->toContain('Rev. Fr. Anselmo Cruz');
});

test('the ceremony date and minister are not printed twice when the details already carry them', function () {
    $html = app(CertificateRenderer::class)->html(entryFor());

    $details = substr($html, strpos($html, '<dl>'), strpos($html, '</dl>') - strpos($html, '<dl>'));
    expect(substr_count($html, 'October 10, 2026'))->toBe(2) // the statement and the "Date of Baptism" row, as before
        ->and(substr_count($details, e(ParishSetting::priestName())))->toBe(1) // one Minister row; the signature block is outside the details
        ->and(substr_count($html, e(ParishSetting::priestName())))->toBe(2); // that row, plus the name printed under the signature line

    $marriage = app(ParishRegister::class)->transcribe([
        'sacrament' => 'wedding', 'ceremonyDate' => '2001-06-09', 'subjectName' => 'Old & Couple', 'minister' => 'Rev. Fr. Anselmo Cruz',
        'details' => [['label' => 'Solemnized by', 'value' => 'Rev. Fr. Anselmo Cruz'], ['label' => 'Married on', 'value' => 'June 9, 2001']], 'bookNo' => '2', 'pageNo' => '5',
    ], $this->staff);
    $html = app(CertificateRenderer::class)->html($marriage);
    expect(substr_count($html, 'June 9, 2001'))->toBe(1)->and(substr_count($html, 'Rev. Fr. Anselmo Cruz'))->toBe(1)
        ->and($html)->not->toContain('Date of Marriage')->not->toContain('Officiating Minister');
});
