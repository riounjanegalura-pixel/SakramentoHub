<?php

use App\Validation\SacramentRules;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

beforeEach(fn () => Storage::fake('local'));

$fixtures = collect(glob(dirname(__DIR__, 3).'/contracts/fixtures/*/*.json'))
    ->mapWithKeys(fn (string $path) => [basename(dirname($path)).'/'.basename($path, '.json') => $path]);

test('valid fixtures pass the server rules', function (string $name) {
    $owner = (string) Str::uuid();
    [$sacrament] = explode('/', $name);

    expect(SacramentRules::errors($sacrament, formDataFixture($name, $owner), $owner))->toBe([]);
})->with($fixtures->keys()->filter(fn ($n) => str_contains($n, '/valid-'))->values()->all());

test('invalid fixtures fail at the expected key', function (string $name) {
    $owner = (string) Str::uuid();
    [$sacrament] = explode('/', $name);
    $expected = json_decode(file_get_contents(base_path("../contracts/fixtures/{$name}.json")), true)['expectErrorKey'];

    expect(SacramentRules::errors($sacrament, formDataFixture($name, $owner), $owner))->toHaveKey($expected);
})->with($fixtures->keys()->filter(fn ($n) => str_contains($n, '/invalid-'))->values()->all());

test('an empty booking cannot pass for any sacrament', function (string $sacrament) {
    expect(SacramentRules::errors($sacrament, [], (string) Str::uuid()))->not->toBe([]);
})->with(['baptism', 'confirmation', 'wedding', 'funeral', 'anointing', 'house-blessing']);

test('a document owned by someone else is rejected', function () {
    $owner = (string) Str::uuid();
    $data = formDataFixture('funeral/valid-basic', $owner);
    $stranger = (string) Str::uuid();
    Storage::disk('local')->put("documents/{$stranger}/death.pdf", 'x');
    $data['deathCertificate'] = "/documents/{$stranger}/death.pdf";

    expect(SacramentRules::errors('funeral', $data, $owner))->toHaveKey('deathCertificate');
});

test('a referenced document that does not exist is rejected', function () {
    $owner = (string) Str::uuid();
    $data = formDataFixture('funeral/valid-basic', $owner);
    $data['deathCertificate'] = "/documents/{$owner}/missing.pdf";

    expect(SacramentRules::errors('funeral', $data, $owner))->toHaveKey('deathCertificate');
});

test('validate() throws with formData-prefixed keys', function () {
    SacramentRules::validate('anointing', [], (string) Str::uuid());
})->throws(Illuminate\Validation\ValidationException::class);

test('directory references are rejected as documents', function (string $name) {
    $owner = (string) Str::uuid();
    $data = formDataFixture('funeral/valid-basic', $owner);
    $data['deathCertificate'] = "/documents/{$owner}/{$name}";

    expect(SacramentRules::errors('funeral', $data, $owner))->toHaveKey('deathCertificate');
})->with(['..', '.', '.hidden']);

test('a null owner cannot reference any document', function () {
    $owner = (string) Str::uuid();
    $data = formDataFixture('funeral/valid-basic', $owner);

    expect(SacramentRules::errors('funeral', $data, null))->toHaveKey('deathCertificate');
});

test('malformed input yields validation errors instead of exceptions', function () {
    $owner = (string) Str::uuid();

    $c = formDataFixture('confirmation/valid-basic', $owner);
    $c['sponsors'] = ['x'];
    expect(SacramentRules::errors('confirmation', $c, $owner))->not->toBe([]);

    $c = formDataFixture('confirmation/valid-basic', $owner);
    $c['fatherFirstName'] = ['a'];
    expect(SacramentRules::errors('confirmation', $c, $owner))->not->toBe([]);

    $w = formDataFixture('wedding/valid-basic', $owner);
    $w['sponsors'][0]['role'] = true;
    expect(SacramentRules::errors('wedding', $w, $owner))->not->toBe([]);
});

test('a baptism can leave out the mother with a reason, as it can the father', function () {
    $owner = (string) Str::uuid();
    $d = formDataFixture('baptism/valid-basic', $owner);
    foreach (['motherFirstName', 'motherMiddleName', 'motherLastName', 'motherSuffix', 'motherReligion'] as $k) {
        unset($d[$k]);
    }
    foreach (array_keys($d) as $k) {
        if (str_starts_with($k, 'motherPlaceOfBirth')) {
            unset($d[$k]);
        }
    }

    expect(SacramentRules::errors('baptism', array_merge($d, ['motherOmitted' => true, 'motherOmittedReason' => 'Estranged / uncontactable']), $owner))->toBe([]);
    expect(SacramentRules::errors('baptism', array_merge($d, ['motherOmitted' => true]), $owner))->toHaveKey('motherOmittedReason');
});

test('a baptism can leave out both parents, for example an adult baptism', function () {
    $owner = (string) Str::uuid();
    $d = array_merge(formDataFixture('baptism/valid-basic', $owner), [
        'fatherOmitted' => true, 'fatherOmittedReason' => 'Estranged / uncontactable', 'motherOmitted' => true, 'motherOmittedReason' => 'Estranged / uncontactable',
    ]);

    expect(SacramentRules::errors('baptism', $d, $owner))->toBe([]);
});

// Found by a tester: a death date from 1988 was accepted, which left a calendar with no valid burial date.
test('a funeral death date older than the burial window is refused', function () {
    $owner = (string) Str::uuid();
    $data = formDataFixture('funeral/valid-basic', $owner);
    $data['deceasedDateOfDeath'] = date('Y-m-d', strtotime('-1 year'));
    $data['burialDate'] = date('Y-m-d', strtotime('+3 days'));

    expect(SacramentRules::errors('funeral', $data, $owner))->toHaveKey('deceasedDateOfDeath');
});

test('a funeral burial date cannot be in the past', function () {
    $owner = (string) Str::uuid();
    $data = formDataFixture('funeral/valid-basic', $owner);
    $data['deceasedDateOfDeath'] = date('Y-m-d', strtotime('-10 days'));
    $data['burialDate'] = date('Y-m-d', strtotime('-3 days'));

    expect(SacramentRules::errors('funeral', $data, $owner))->toHaveKey('burialDate');
});

test('anointing refuses a hospital or room that is not a real name', function (string $hospital, string $room, string $badKey) {
    $owner = (string) Str::uuid();
    $data = formDataFixture('anointing/valid-hospital', $owner);
    $data['hospitalName'] = $hospital;
    $data['hospitalRoom'] = $room;

    expect(SacramentRules::errors('anointing', $data, $owner))->toHaveKey($badKey);
})->with([
    'one letter hospital' => ['a', '12', 'hospitalName'],
    'digits only hospital' => ['123', '12', 'hospitalName'],
    'symbols only room' => ['Pulilan District Hospital', '--', 'hospitalRoom'],
]);

test('a newborn cannot register, but a teen can', function () {
    $base = ['fullName' => 'Test Person', 'email' => 'teen@example.com', 'phone' => '09171234567', 'password' => 'password123', 'privacyConsent' => true, 'sex' => 'male'];

    $this->postJson('/api/register', $base + ['birthDate' => date('Y-m-d')])->assertStatus(422)->assertJsonValidationErrors('birthDate');
    $this->postJson('/api/register', $base + ['birthDate' => date('Y-m-d', strtotime('-14 years'))])->assertCreated();
});
