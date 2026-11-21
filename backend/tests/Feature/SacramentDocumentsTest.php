<?php

use App\Models\User;
use App\Validation\SacramentDocuments;
use App\Validation\SacramentRules;
use Illuminate\Support\Facades\Storage;

beforeEach(function () {
    Storage::fake('local');
    $this->seed(\Database\Seeders\ServiceSeeder::class);
});

$keys = fn (array $docs, bool $requiredOnly = false) => array_values(array_map(
    fn ($d) => $d['key'], array_filter($docs, fn ($d) => ! $requiredOnly || $d['required']),
));

test('baptism documents are all optional, whatever the parents marriage', function () use ($keys) {
    expect($keys(SacramentDocuments::for('baptism', ['parentsMarriage' => 'catholic']), true))->toBe([])
        ->and($keys(SacramentDocuments::for('baptism', ['parentsMarriage' => 'not_married']), true))->toBe([])
        ->and($keys(SacramentDocuments::for('baptism', ['parentsMarriage' => 'catholic'])))->toBe(['birthCertificate', 'marriageContract']);
});

test('wedding documents depend on each party civil status', function () use ($keys) {
    $required = $keys(SacramentDocuments::for('wedding', ['groomCivilStatus' => 'widowed', 'brideCivilStatus' => 'annulled']), true);
    expect($required)->toContain('groomSpouseDeathCertificate', 'brideNullityDecree', 'groomCenomar', 'brideBaptismalCertificate', 'groomPhoto', 'bridePhoto')
        ->and($required)->not->toContain('brideSpouseDeathCertificate', 'groomNullityDecree', 'marriageLicense');
    expect($keys(SacramentDocuments::for('wedding', [])))->toContain('marriageLicense', 'preCanaCertificate', 'bannsCertificate', 'confessionCertificate', 'groomPhoto', 'bridePhoto');
});

test('services without documents return an empty list', function () {
    expect(SacramentDocuments::for('anointing', []))->toBe([])
        ->and(SacramentDocuments::for('house-blessing', []))->toBe([])
        ->and(SacramentDocuments::for('unknown', []))->toBe([]);
});

test('every entry has a non-empty label', function () {
    foreach (['baptism', 'confirmation', 'wedding', 'funeral'] as $s) {
        foreach (SacramentDocuments::for($s, []) as $doc) {
            expect($doc['label'])->toBeString()->not->toBe('');
        }
    }
});

test('validation still rejects a missing required document', function () {
    $owner = User::factory()->create();
    $data = formDataFixture('funeral/valid-basic', $owner->id);
    unset($data['deathCertificate']);
    expect(SacramentRules::errors('funeral', $data, $owner->id))->toHaveKey('deathCertificate');
});

test('a document uploaded by the booking creator is accepted for a walk-in', function () {
    $staff = User::factory()->create(['role' => 'staff']);
    $data = formDataFixture('funeral/valid-basic', $staff->id); // files live under the staff member's folder
    expect(SacramentRules::errors('funeral', $data, null, $staff->id))->toBe([])
        ->and(SacramentRules::errors('funeral', $data, null, null))->toHaveKey('deathCertificate');
});

test('a document uploaded by a third account is still refused', function () {
    $owner = User::factory()->create();
    $stranger = User::factory()->create();
    $data = formDataFixture('funeral/valid-basic', $stranger->id);
    expect(SacramentRules::errors('funeral', $data, $owner->id, null))->toHaveKey('deathCertificate');
});
