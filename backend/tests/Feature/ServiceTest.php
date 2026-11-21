<?php

use Database\Seeders\ServiceSeeder;

beforeEach(fn () => $this->seed(ServiceSeeder::class));

test('lists all 6 seeded services', function () {
    $this->getJson('/api/services')
        ->assertOk()
        ->assertJsonCount(6)
        ->assertJsonFragment(['id' => 'baptism', 'priceCentavos' => 5000])
        ->assertJsonFragment(['id' => 'wedding', 'priceCentavos' => 500000])
        ->assertJsonFragment(['id' => 'confirmation', 'priceCentavos' => null]);
});

test('shows a single service by id', function () {
    $this->getJson('/api/services/baptism')
        ->assertOk()
        ->assertJsonPath('name', 'Baptism');
});

test('404s for an unknown service id', function () {
    $this->getJson('/api/services/nonexistent')->assertNotFound();
});

test('services expose their scheduling rules', function () {
    $this->getJson('/api/services')
        ->assertOk()
        ->assertJsonFragment(['id' => 'baptism', 'feeRule' => 'per_sponsor', 'sessionTimes' => ['10:00'], 'sessionWeekdays' => [7]])
        ->assertJsonFragment(['id' => 'wedding', 'leadTimeDays' => 2, 'dailyCapacity' => 2]);
});

test('parish info exposes the contact number and priest', function () {
    $this->seed(Database\Seeders\ParishSettingSeeder::class);

    $this->getJson('/api/parish')->assertOk()->assertExactJson([
        'name' => 'St. Peter the Apostle Parish',
        'phone' => '09123456789',
        'address' => 'Balagtas, Bulacan',
        'priestName' => 'Rev. Fr. Leopoldo S. Evangelista',
        'workingHours' => ['start' => '08:00', 'end' => '17:00'],
        'demoPaymentOtp' => false,
        'approvalBeforePayment' => false,
        'lunchBreak' => ['start' => '12:00', 'end' => '13:00'],
    ]);
});
