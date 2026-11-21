<?php

use App\Models\Booking;
use App\Models\RegisterEntry;
use App\Models\User;
use App\Services\Register\ParishRegister;
use Database\Seeders\ParishSettingSeeder;
use Database\Seeders\ServiceSeeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\RateLimiter;

const NOT_FOUND = 'No record found. Check the number and code on the certificate.';

beforeEach(function () {
    $this->seed(ServiceSeeder::class);
    $this->seed(ParishSettingSeeder::class);
    Carbon::setTestNow(Carbon::parse('2026-11-02 00:00:00', 'UTC'));
    RateLimiter::clear('certificate-verify');
    $this->staff = User::factory()->create(['role' => 'staff']);
});
afterEach(fn () => Carbon::setTestNow());

function verifiableEntry(string $sacrament = 'baptism'): RegisterEntry
{
    $booking = Booking::factory()->scheduled('2026-10-10', '10:00', '11:00')->create([
        'sacrament' => $sacrament, 'status' => 'completed',
        'form_data' => ['childFirstName' => 'Maria', 'childLastName' => 'Santos', 'motherFirstName' => 'Ana', 'motherLastName' => 'Santos'],
    ]);

    return app(ParishRegister::class)->record($booking, test()->staff);
}

test('a valid number and code answers with exactly the eight public keys', function () {
    $entry = verifiableEntry();

    $res = $this->postJson('/api/verify', ['number' => $entry->register_number, 'code' => ParishRegister::formatCode($entry->verify_code)]);

    $res->assertOk()->assertExactJson([
        'status' => 'valid',
        'parishName' => 'St. Peter the Apostle Parish',
        'sacrament' => 'Baptism',
        'registerNumber' => $entry->register_number,
        'subjectName' => 'Maria Santos',
        'ceremonyDate' => '2026-10-10',
        'minister' => 'Rev. Fr. Leopoldo S. Evangelista',
        'correctedOn' => null,
    ]);
    expect($res->headers->get('Cache-Control'))->toContain('no-store');
});

test('a revoked entry answers with status revoked', function () {
    $entry = verifiableEntry();
    $entry->update(['status' => 'revoked']);

    $this->postJson('/api/verify', ['number' => $entry->register_number, 'code' => $entry->verify_code])
        ->assertOk()->assertJsonPath('status', 'revoked');
});

test('the number and code resolve as people type them', function (string $number, string $code) {
    $entry = verifiableEntry();
    $formatted = ParishRegister::formatCode($entry->verify_code);
    $typed = [
        'number' => $number === 'lower' ? strtolower($entry->register_number) : ' '.$entry->register_number.' ',
        'code' => match ($code) {
            'spaces' => str_replace('-', ' ', $formatted),
            'plain' => $entry->verify_code,
            'lower' => strtolower($formatted),
        },
    ];

    $this->postJson('/api/verify', $typed)->assertOk()->assertJsonPath('registerNumber', $entry->register_number);
})->with([['lower', 'spaces'], ['padded', 'plain'], ['lower', 'lower']]);

test('a wrong code and an unknown number are the same 404', function () {
    $entry = verifiableEntry();

    $wrong = $this->postJson('/api/verify', ['number' => $entry->register_number, 'code' => 'AAAA-AAAA-AAAA']);
    $unknown = $this->postJson('/api/verify', ['number' => 'BAP-2026-9999', 'code' => ParishRegister::formatCode($entry->verify_code)]);

    $wrong->assertNotFound()->assertExactJson(['message' => NOT_FOUND]);
    $unknown->assertNotFound()->assertExactJson(['message' => NOT_FOUND]);
    expect($unknown->getContent())->toBe($wrong->getContent());
});

test('an anointing entry cannot be verified', function () {
    $entry = verifiableEntry('anointing');

    expect($entry->verify_code)->toBeNull();
    $this->postJson('/api/verify', ['number' => $entry->register_number, 'code' => 'AAAA-AAAA-AAAA'])
        ->assertNotFound()->assertExactJson(['message' => NOT_FOUND]);
    $this->postJson('/api/verify', ['number' => $entry->register_number, 'code' => ''])->assertStatus(422);
});

test('a corrected entry returns the correction date and the corrected name', function () {
    $entry = verifiableEntry();
    $snapshot = $entry->snapshot;
    $snapshot['subjectName'] = 'Maria Clara Santos';
    // 20:00 UTC on 1 Nov is already 2 Nov in Manila.
    $entry->update(['snapshot' => $snapshot, 'subject_name' => 'Maria Clara Santos', 'corrected_at' => Carbon::parse('2026-11-01 20:00:00', 'UTC')]);

    $this->postJson('/api/verify', ['number' => $entry->register_number, 'code' => $entry->verify_code])
        ->assertOk()->assertJsonPath('subjectName', 'Maria Clara Santos')->assertJsonPath('correctedOn', '2026-11-02');
});

test('input is validated', function () {
    $this->postJson('/api/verify', [])->assertStatus(422)->assertJsonValidationErrors(['number', 'code']);
    $this->postJson('/api/verify', ['number' => str_repeat('A', 21), 'code' => 'A'])->assertStatus(422)->assertJsonValidationErrors(['number']);
    $this->postJson('/api/verify', ['number' => 'A', 'code' => str_repeat('A', 31)])->assertStatus(422)->assertJsonValidationErrors(['code']);
});

test('the 21st request in a minute is throttled', function () {
    for ($i = 1; $i <= 20; $i++) {
        $this->postJson('/api/verify', ['number' => 'BAP-2026-9999', 'code' => 'AAAA-AAAA-AAAA'])->assertNotFound();
    }

    $this->postJson('/api/verify', ['number' => 'BAP-2026-9999', 'code' => 'AAAA-AAAA-AAAA'])->assertStatus(429);
});

test('verification needs no login', function () {
    $entry = verifiableEntry();

    $this->postJson('/api/verify', ['number' => $entry->register_number, 'code' => $entry->verify_code])->assertOk();
});

test('the app trusts the proxy in front of it, so the throttle sees the visitor and not the proxy', function () {
    \Illuminate\Support\Facades\Route::get('/_client-ip', fn (\Illuminate\Http\Request $r) => $r->ip());

    $this->withServerVariables(['REMOTE_ADDR' => '10.0.0.1'])
        ->get('/_client-ip', ['X-Forwarded-For' => '203.0.113.9'])
        ->assertOk()->assertSee('203.0.113.9');
});
