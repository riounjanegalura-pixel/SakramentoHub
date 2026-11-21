<?php

use App\Models\User;

test('registration requires birth date and sex and returns them', function () {
    $this->postJson('/api/register', [
        'fullName' => 'Maria Clara Santos', 'email' => 'maria@example.com', 'password' => 'password123',
        'privacyConsent' => true,
    ])->assertUnprocessable()->assertJsonValidationErrors(['birthDate', 'sex']);

    $this->postJson('/api/register', [
        'fullName' => 'Maria Clara Santos', 'email' => 'maria@example.com', 'password' => 'password123',
        'privacyConsent' => true, 'birthDate' => '1990-05-01', 'sex' => 'female',
    ])->assertCreated()->assertJsonPath('user.birthDate', '1990-05-01')->assertJsonPath('user.homeParish', 'St. Peter the Apostle Parish, Balagtas');
});

test('profile update stores the structured address and civil status', function () {
    $user = User::factory()->create();

    $this->actingAs($user)->patchJson('/api/me', [
        'civilStatus' => 'married',
        'addressLine' => '123 Mabini St.',
        'addressPsgc' => ['display' => 'San Juan, Balagtas, Bulacan', 'regionCode' => '030000000', 'provinceCode' => '031400000', 'cityCode' => '031402000', 'barangayCode' => '031402011'],
    ])->assertOk()
        ->assertJsonPath('civilStatus', 'married')
        ->assertJsonPath('addressPsgc.display', 'San Juan, Balagtas, Bulacan');
});

test('profile update rejects a future birth date', function () {
    $this->actingAs(User::factory()->create())->patchJson('/api/me', ['birthDate' => '2999-01-01'])
        ->assertUnprocessable()->assertJsonValidationErrors(['birthDate']);
});

test('profile update clears the address when null is sent explicitly', function () {
    $user = User::factory()->create([
        'address_line' => '123 Mabini St.',
        'address_psgc' => ['display' => 'San Juan, Balagtas, Bulacan'],
    ]);

    $this->actingAs($user)->patchJson('/api/me', ['addressLine' => null, 'addressPsgc' => null])
        ->assertOk()
        ->assertJsonPath('addressLine', null)
        ->assertJsonPath('addressPsgc', null);

    $user->refresh();
    expect($user->address_line)->toBeNull()->and($user->address_psgc)->toBeNull();
});

test('profile update leaves the address untouched when the keys are not sent', function () {
    $user = User::factory()->create(['address_line' => '123 Mabini St.']);

    $this->actingAs($user)->patchJson('/api/me', ['civilStatus' => 'single'])->assertOk();

    expect($user->refresh()->address_line)->toBe('123 Mabini St.');
});

test('profile update stores only the documented addressPsgc keys', function () {
    $user = User::factory()->create();

    $this->actingAs($user)->patchJson('/api/me', [
        'addressPsgc' => ['display' => 'San Juan, Balagtas, Bulacan', 'barangayCode' => '031402011', 'evil' => 'x'],
    ])->assertOk();

    expect($user->refresh()->address_psgc)->toBe(['display' => 'San Juan, Balagtas, Bulacan', 'barangayCode' => '031402011']);
});
