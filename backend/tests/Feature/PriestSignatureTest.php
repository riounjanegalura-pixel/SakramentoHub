<?php

use App\Models\AuditLog;
use App\Models\Booking;
use App\Models\ParishSetting;
use App\Models\RegisterEntry;
use App\Models\User;
use App\Services\Register\CertificateRenderer;
use App\Services\Register\ParishRegister;
use Database\Seeders\ParishSettingSeeder;
use Database\Seeders\ServiceSeeder;
use Illuminate\Support\Carbon;

beforeEach(function () {
    $this->seed(ServiceSeeder::class);
    $this->seed(ParishSettingSeeder::class);
    Carbon::setTestNow(Carbon::parse('2026-11-02 00:00:00', 'UTC')); // November 2, 2026 in Manila
    $this->staff = User::factory()->create(['role' => 'staff']);
    $this->admin = User::factory()->create(['role' => 'admin']);
});
afterEach(fn () => Carbon::setTestNow());

/** A real, whole PNG: grey, 1x1 unless asked, optionally padded with a text chunk to reach a size. */
function sigPng(int $padding = 0, int $width = 1, int $height = 1, ?int $pixelsWide = null): string
{
    $chunk = fn (string $type, string $data) => pack('N', strlen($data)).$type.$data.pack('N', crc32($type.$data));
    $rows = str_repeat("\x00".str_repeat("\x00", $pixelsWide ?? $width), $height); // filter byte + one grey byte per pixel

    return "\x89PNG\r\n\x1a\n"
        .$chunk('IHDR', pack('NNCCCCC', $width, $height, 8, 0, 0, 0, 0))
        .($padding > 0 ? $chunk('tEXt', "Comment\0".str_repeat('a', $padding)) : '')
        .$chunk('IDAT', gzcompress($rows))
        .$chunk('IEND', '');
}

/** A whole baseline JPEG: start, frame header, one scan, end. */
function sigJpeg(): string
{
    return "\xFF\xD8"
        ."\xFF\xE0".pack('n', 16)."JFIF\0\x01\x01\x00\x00\x01\x00\x01\x00\x00"
        ."\xFF\xC0".pack('n', 11)."\x08".pack('nn', 1, 1)."\x01\x01\x11\x00"
        ."\xFF\xDA".pack('n', 8)."\x01\x01\x00\x00\x3F\x00"
        ."\x00"
        ."\xFF\xD9";
}

function sigUrl(string $bytes, string $mime = 'image/png'): string
{
    return "data:{$mime};base64,".base64_encode($bytes);
}

function sigEntry(string $status = 'active'): RegisterEntry
{
    $owner = User::factory()->create();
    $booking = Booking::factory()->scheduled('2026-10-10', '10:00', '11:00')->create([
        'user_id' => $owner->id, 'sacrament' => 'baptism', 'status' => 'completed',
        'form_data' => ['childFirstName' => 'Maria', 'childLastName' => 'Santos'],
    ]);
    $entry = app(ParishRegister::class)->record($booking, test()->staff);
    if ($status !== 'active') {
        $entry->update(['status' => $status]);
    }

    return $entry->fresh();
}

function patchParish(User $who, array $payload)
{
    return test()->actingAs($who)->patchJson('/api/admin/settings/parish', $payload);
}

// --- the signature block on the certificate --------------------------------------------------------------------------

test('a certificate has a signature line, the priest name, the default title and the date issued, and no image when none is set', function () {
    $html = app(CertificateRenderer::class)->html(sigEntry());

    expect($html)->toContain('class="sig-line"')
        ->toContain('<p class="sig-name">Rev. Fr. Leopoldo S. Evangelista</p>')
        ->toContain('<p class="sig-title">Parish Priest</p>')
        ->toContain('Date issued: November 2, 2026')
        ->not->toContain('class="sig-image"')->not->toContain('data:image/');
});

test('a configured signature image is printed above the line', function () {
    patchParish($this->admin, ['priestSignature' => sigUrl(sigPng())])->assertOk();

    $html = app(CertificateRenderer::class)->html(sigEntry());

    $img = strpos($html, '<img class="sig-image" src="'.sigUrl(sigPng()).'" alt="Signature of Rev. Fr. Leopoldo S. Evangelista">');
    expect($img)->not->toBeFalse()->and($img)->toBeLessThan(strpos($html, 'class="sig-line"'));
});

test('the priest name and title are escaped', function () {
    ParishSetting::put('priest_name', 'Rev. <b>Fr.</b> X');
    ParishSetting::put('priest_title', '<script>alert(1)</script>');

    $html = app(CertificateRenderer::class)->html(sigEntry());

    expect($html)->not->toContain('<script>alert(1)')->not->toContain('<b>Fr.</b>')
        ->toContain('&lt;script&gt;alert(1)&lt;/script&gt;')->toContain('Rev. &lt;b&gt;Fr.&lt;/b&gt; X');
});

test('a stored value that is not a clean PNG or JPEG data URL is never printed', function () {
    ParishSetting::put('priest_signature', 'data:image/svg+xml;base64,'.base64_encode('<svg onload="alert(1)"/>'));
    expect(app(CertificateRenderer::class)->html(sigEntry()))->not->toContain('class="sig-image"')->not->toContain('svg+xml');

    ParishSetting::put('priest_signature', 'data:image/png;base64,AAAA" onerror="alert(1)');
    expect(app(CertificateRenderer::class)->html(sigEntry()))->not->toContain('class="sig-image"')->not->toContain('onerror');
});

test('a custom title is printed instead of the default', function () {
    patchParish($this->admin, ['priestTitle' => 'Parish Priest and Vicar Forane'])->assertOk();

    expect(app(CertificateRenderer::class)->html(sigEntry()))->toContain('<p class="sig-title">Parish Priest and Vicar Forane</p>');
});

test('a revoked certificate keeps the signature line but not the image', function () {
    patchParish($this->admin, ['priestSignature' => sigUrl(sigPng())])->assertOk();

    $html = app(CertificateRenderer::class)->html(sigEntry('revoked'));

    expect($html)->toContain('REVOKED')->toContain('class="sig-line"')->not->toContain('class="sig-image"');
});

// --- the baptism registration form -----------------------------------------------------------------------------------

test('the baptism registration form has the signature block; only the office copy carries the image', function () {
    patchParish($this->admin, ['priestSignature' => sigUrl(sigJpeg(), 'image/jpeg')])->assertOk();
    $owner = User::factory()->create();
    $booking = Booking::factory()->scheduled('2026-12-12', '09:00', '10:00')->create([
        'user_id' => $owner->id, 'sacrament' => 'baptism', 'status' => 'submitted',
        'form_data' => ['childFirstName' => 'Jose', 'childLastName' => 'Rizal'],
    ]);

    $office = $this->actingAs($this->staff)->get("/api/admin/bookings/{$booking->id}/certificate")->assertOk()->getContent();
    expect($office)->toContain('Registration for Baptism')->toContain('class="sig-line"')
        ->toContain('<p class="sig-name">Rev. Fr. Leopoldo S. Evangelista</p>')->toContain('<p class="sig-title">Parish Priest</p>')
        ->toContain('Date issued: November 2, 2026')
        ->toContain('<img class="sig-image" src="'.sigUrl(sigJpeg(), 'image/jpeg').'"');

    // The parishioner's own copy is printed before the parish has looked at it: no signature image on it.
    $own = $this->actingAs($owner)->get("/api/bookings/{$booking->id}/certificate")->assertOk()->getContent();
    expect($own)->toContain('class="sig-line"')->toContain('<p class="sig-title">Parish Priest</p>')->not->toContain('class="sig-image"');
});

// --- the settings --------------------------------------------------------------------------------------------------

test('the title defaults to Parish Priest and there is no signature until one is uploaded', function () {
    $this->actingAs($this->staff)->getJson('/api/admin/settings')->assertOk()
        ->assertJsonPath('parish.priestTitle', 'Parish Priest')->assertJsonPath('parish.priestSignature', null);
    expect(ParishSetting::priestTitle())->toBe('Parish Priest')->and(ParishSetting::priestSignature())->toBeNull();
});

test('an admin sets a PNG or a JPEG signature, and it is stored under the type its bytes really have', function () {
    patchParish($this->admin, ['priestSignature' => sigUrl(sigPng())])->assertOk()->assertJsonPath('priestSignature', sigUrl(sigPng()));
    expect(ParishSetting::priestSignature())->toBe(sigUrl(sigPng()));

    // Declared as PNG, but the bytes are a JPEG: the declared type is not trusted.
    patchParish($this->admin, ['priestSignature' => sigUrl(sigJpeg(), 'image/png')])->assertOk()
        ->assertJsonPath('priestSignature', sigUrl(sigJpeg(), 'image/jpeg'));

    // A real PNG of a realistic size is fine too.
    $crest = (string) file_get_contents(resource_path('art/crest-sm.png'));
    patchParish($this->admin, ['priestSignature' => sigUrl($crest)])->assertOk();
    expect(ParishSetting::priestSignature())->toBe(sigUrl($crest));
});

test('an admin removes the signature by sending null', function () {
    patchParish($this->admin, ['priestSignature' => sigUrl(sigPng())])->assertOk();
    patchParish($this->admin, ['priestSignature' => null])->assertOk()->assertJsonPath('priestSignature', null);

    expect(ParishSetting::priestSignature())->toBeNull()
        ->and(app(CertificateRenderer::class)->html(sigEntry()))->not->toContain('class="sig-image"');
});

test('the signature is refused unless it decodes as a whole PNG or JPEG of at most 200 KB', function (Closure $value, string $message) {
    patchParish($this->admin, ['priestSignature' => $value()])->assertUnprocessable()
        ->assertJsonValidationErrors(['priestSignature'])->assertJsonPath('errors.priestSignature.0', $message);
    expect(ParishSetting::priestSignature())->toBeNull();
})->with([
    'an SVG' => [fn () => sigUrl('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', 'image/svg+xml'), 'Upload the signature as a PNG or JPEG image.'],
    'an SVG declared as PNG' => [fn () => sigUrl('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'The signature image could not be read. Upload a PNG or JPEG file.'],
    'a GIF' => [fn () => sigUrl("GIF89a\x01\x00\x01\x00\x00\x00\x00;", 'image/gif'), 'Upload the signature as a PNG or JPEG image.'],
    'a GIF declared as PNG' => [fn () => sigUrl("GIF89a\x01\x00\x01\x00\x00\x00\x00;"), 'The signature image could not be read. Upload a PNG or JPEG file.'],
    'text declared as PNG' => [fn () => sigUrl('just some text'), 'The signature image could not be read. Upload a PNG or JPEG file.'],
    'a PDF' => [fn () => sigUrl('%PDF-1.4 nothing', 'application/pdf'), 'Upload the signature as a PNG or JPEG image.'],
    'not a data URL' => [fn () => 'https://example.com/signature.png', 'Upload the signature as a PNG or JPEG image.'],
    'broken base64' => [fn () => 'data:image/png;base64,iVBORw0KGgo*!!', 'Upload the signature as a PNG or JPEG image.'],
    'base64 that is not base64' => [fn () => 'data:image/png;base64,A', 'The signature image could not be read. Upload a PNG or JPEG file.'],
    'a PNG over 200 KB' => [fn () => sigUrl(sigPng(205 * 1024)), 'The signature image must be 200 KB or smaller.'],
    'a payload far over the limit' => [fn () => sigUrl(str_repeat('a', 400 * 1024)), 'The signature image must be 200 KB or smaller.'],
    'a PNG with a damaged chunk' => [fn () => sigUrl(substr_replace(sigPng(), 'XXXX', -16, 4)), 'The signature image could not be read. Upload a PNG or JPEG file.'],
    'a PNG cut short' => [fn () => sigUrl(substr(sigPng(), 0, -12)), 'The signature image could not be read. Upload a PNG or JPEG file.'],
    'a PNG whose pixels do not match its size' => [fn () => sigUrl(sigPng(0, 2, 1, pixelsWide: 1)), 'The signature image could not be read. Upload a PNG or JPEG file.'],
    'a PNG too large to draw' => [fn () => sigUrl(sigPng(0, 2001, 1)), 'The signature image must be at most 2000 × 2000 pixels.'],
    'a JPEG cut short' => [fn () => sigUrl(substr(sigJpeg(), 0, -2), 'image/jpeg'), 'The signature image could not be read. Upload a PNG or JPEG file.'],
    'a JPEG with no picture data' => [fn () => sigUrl("\xFF\xD8\xFF\xD9", 'image/jpeg'), 'The signature image could not be read. Upload a PNG or JPEG file.'],
    'a number' => [fn () => 12345, 'Upload the signature as a PNG or JPEG image.'],
]);

test('the title is validated', function (mixed $title) {
    patchParish($this->admin, ['priestTitle' => $title])->assertUnprocessable()->assertJsonValidationErrors(['priestTitle']);
})->with(['', 'ab', str_repeat('x', 81), null]);

test('changing the signature is audited without copying the image into the log', function () {
    patchParish($this->admin, ['priestSignature' => sigUrl(sigPng()), 'priestTitle' => 'Rector'])->assertOk();

    $meta = AuditLog::where('action', 'settings.parish_updated')->sole()->metadata;
    expect($meta['before'])->toEqual(['priestSignature' => null, 'priestTitle' => 'Parish Priest'])
        ->and($meta['after']['priestTitle'])->toBe('Rector')
        ->and($meta['after']['priestSignature'])->toStartWith('PNG image, '.strlen(sigPng()).' bytes, sha256 ')
        ->and(json_encode($meta))->not->toContain('base64');

    // The same image again is no change; removing it is.
    patchParish($this->admin, ['priestSignature' => sigUrl(sigPng())])->assertOk();
    expect(AuditLog::where('action', 'settings.parish_updated')->count())->toBe(1);
    patchParish($this->admin, ['priestSignature' => null])->assertOk();
    $last = AuditLog::where('action', 'settings.parish_updated')->latest('id')->first()->metadata;
    expect($last['after'])->toBe(['priestSignature' => null])->and($last['before']['priestSignature'])->toStartWith('PNG image');
});

test('only the admin can change the title or the signature', function () {
    patchParish($this->staff, ['priestTitle' => 'Rector'])->assertForbidden();
    patchParish($this->staff, ['priestSignature' => sigUrl(sigPng())])->assertForbidden();
    patchParish(User::factory()->create(), ['priestSignature' => sigUrl(sigPng())])->assertForbidden();

    expect(ParishSetting::priestTitle())->toBe('Parish Priest')->and(ParishSetting::priestSignature())->toBeNull();
});

test('the signature never appears in the public parish facts', function () {
    patchParish($this->admin, ['priestSignature' => sigUrl(sigPng())])->assertOk();

    expect($this->getJson('/api/parish')->assertOk()->getContent())->not->toContain('base64')->not->toContain('ignature');
});
