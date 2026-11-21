<?php

use App\Models\User;

beforeEach(fn () => $this->seed(\Database\Seeders\ServiceSeeder::class));

// The office's walk-in form is built from the server's own rules, so it asks for what the server will accept.
test('staff get the funeral form as a field list built from the server rules', function () {
    $staff = User::factory()->create(['role' => 'staff']);

    $res = $this->actingAs($staff, 'sanctum')->getJson('/api/admin/walk-ins/fields/funeral')->assertOk();
    $keys = collect($res->json('fields'))->keyBy('key');

    expect($keys)->toHaveKeys(['deceasedFirstName', 'deceasedDateOfDeath', 'burialDate', 'massType'])
        ->and($keys['deceasedDateOfDeath']['type'])->toBe('date')
        ->and($keys['deceasedDateOfDeath']['required'])->toBeTrue()
        ->and($keys['massType']['options'])->toBe(['church', 'house'])
        ->and($keys->has('bookingFor'))->toBeFalse()
        ->and($keys->has('deceasedResidenceRegionCode'))->toBeFalse()
        ->and(collect($res->json('documents'))->pluck('key')->all())->toBe(['deathCertificate']);
});

test('baptism describes its sponsors as a repeating group', function () {
    $staff = User::factory()->create(['role' => 'staff']);

    $res = $this->actingAs($staff, 'sanctum')->getJson('/api/admin/walk-ins/fields/baptism')->assertOk();

    expect($res->json('sponsors.min'))->toBe(1)
        ->and(collect($res->json('sponsors.fields'))->pluck('key')->all())->toContain('firstName', 'age', 'religion');
});

test('a parishioner cannot read the walk-in form, and an unknown sacrament is a 404', function () {
    $this->actingAs(User::factory()->create(['role' => 'parishioner']), 'sanctum')->getJson('/api/admin/walk-ins/fields/funeral')->assertForbidden();
    $this->actingAs(User::factory()->create(['role' => 'staff']), 'sanctum')->getJson('/api/admin/walk-ins/fields/nope')->assertNotFound();
});
