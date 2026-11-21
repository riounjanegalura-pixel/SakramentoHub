<?php

use App\Validation\SacramentDocuments;
use Database\Seeders\ServiceSeeder;

beforeEach(fn () => $this->seed(ServiceSeeder::class));

test('the requirements endpoint is public and lists documents with their requirement and condition', function () {
    $response = $this->getJson('/api/services/baptism/requirements')->assertOk();

    expect($response->json('serviceId'))->toBe('baptism');
    $docs = collect($response->json('documents'))->keyBy('key');
    expect($docs->keys()->all())->toBe(['birthCertificate', 'marriageContract'])
        ->and($docs['birthCertificate'])->toBe([
            'key' => 'birthCertificate', 'label' => "PSA birth certificate", 'walletKind' => 'birth_certificate',
            'requirement' => 'optional', 'condition' => null,
        ])
        ->and($docs['marriageContract']['requirement'])->toBe('optional')
        ->and($docs['marriageContract']['condition'])->toBeNull()
        ->and($docs['marriageContract']['walletKind'])->toBe('marriage_contract');
});

test('a wedding returns all sixteen documents with plain-words conditions', function () {
    $docs = collect($this->getJson('/api/services/wedding/requirements')->assertOk()->json('documents'))->keyBy('key');

    expect($docs)->toHaveCount(16)
        ->and($docs['groomSpouseDeathCertificate']['condition'])->toBe('Required if the groom is widowed')
        ->and($docs['brideSpouseDeathCertificate']['condition'])->toBe('Required if the bride is widowed')
        ->and($docs['groomNullityDecree']['condition'])->toBe("Required if the groom's previous marriage was annulled")
        ->and($docs['brideNullityDecree']['condition'])->toBe("Required if the bride's previous marriage was annulled")
        ->and($docs['groomCenomar']['requirement'])->toBe('required')
        ->and($docs['marriageLicense']['requirement'])->toBe('optional')
        ->and($docs['groomPhoto']['condition'])->toBeNull();
});

test('anointing and house blessing need no documents', function () {
    foreach (['anointing', 'house-blessing'] as $id) {
        $this->getJson("/api/services/{$id}/requirements")->assertOk()->assertExactJson(['serviceId' => $id, 'documents' => []]);
    }
});

test('an unknown service has no requirements page', function () {
    $this->getJson('/api/services/nonexistent/requirements')->assertNotFound();
});

test('each document maps to the wallet kind in the spec', function () {
    $kind = fn (string $s) => collect(SacramentDocuments::catalogue($s))->pluck('walletKind', 'key')->all();

    expect($kind('baptism'))->toMatchArray(['birthCertificate' => 'birth_certificate', 'marriageContract' => 'marriage_contract'])
        ->and($kind('confirmation'))->toBe(['baptismalCertificate' => 'baptismal_certificate'])
        ->and($kind('funeral'))->toBe(['deathCertificate' => 'death_certificate']);
    expect($kind('wedding'))->toMatchArray([
        'groomBaptismalCertificate' => 'baptismal_certificate', 'brideBaptismalCertificate' => 'baptismal_certificate',
        'groomConfirmationCertificate' => 'confirmation_certificate', 'brideConfirmationCertificate' => 'confirmation_certificate',
        'groomCenomar' => 'cenomar', 'brideCenomar' => 'cenomar',
        'groomSpouseDeathCertificate' => 'death_certificate', 'brideSpouseDeathCertificate' => 'death_certificate',
        'groomNullityDecree' => 'other', 'brideNullityDecree' => 'other', 'groomPhoto' => 'other', 'bridePhoto' => 'other',
        'marriageLicense' => 'other', 'preCanaCertificate' => 'other', 'bannsCertificate' => 'other', 'confessionCertificate' => 'other',
    ]);
});

test('for() only returns keys the catalogue lists, and every catalogue key can come back', function () {
    $variations = [
        'baptism' => [['parentsMarriage' => 'catholic'], ['parentsMarriage' => 'not_married'], []],
        'confirmation' => [[]],
        'funeral' => [[]],
        'anointing' => [[]],
        'house-blessing' => [[]],
        'wedding' => [
            [], ['groomCivilStatus' => 'widowed', 'brideCivilStatus' => 'annulled'],
            ['groomCivilStatus' => 'annulled', 'brideCivilStatus' => 'widowed'], ['groomCivilStatus' => 'single', 'brideCivilStatus' => 'single'],
        ],
    ];

    foreach ($variations as $sacrament => $forms) {
        $catalogue = array_column(SacramentDocuments::catalogue($sacrament), 'key');
        $seen = [];
        foreach ($forms as $form) {
            $keys = array_column(SacramentDocuments::for($sacrament, $form), 'key');
            expect(array_diff($keys, $catalogue))->toBe([]);
            $seen = array_merge($seen, $keys);
        }
        expect(array_diff($catalogue, $seen))->toBe([]);
    }
});

test('the catalogue requirement agrees with for() on required documents', function () {
    foreach (['baptism', 'confirmation', 'funeral', 'wedding'] as $sacrament) {
        $required = collect(SacramentDocuments::for($sacrament, []))->where('required')->pluck('key')->sort()->values()->all();
        $always = collect(SacramentDocuments::catalogue($sacrament))->where('requirement', 'required')->pluck('key')->sort()->values()->all();
        expect(array_diff($always, $required))->toBe([]);
    }
});
