<?php

use App\Models\User;
use Illuminate\Support\Facades\Hash;

test('registers a new user and returns a token', function () {
    $response = $this->postJson('/api/register', [
        'fullName' => 'Rio Dela Cruz',
        'email' => 'rio@example.com',
        'phone' => '09171234567',
        'password' => 'password123',
        'privacyConsent' => true,
        'birthDate' => '1990-05-01', 'sex' => 'female',
    ]);

    $response->assertCreated()
        ->assertJsonPath('user.fullName', 'Rio Dela Cruz')
        ->assertJsonPath('user.email', 'rio@example.com')
        // Regression check: User::create() doesn't reflect DB-applied column
        // defaults (role's default of 'parishioner') in the in-memory model
        // it returns, so this used to come back null until AuthController
        // explicitly refreshed the model after create().
        ->assertJsonPath('user.role', 'parishioner')
        ->assertJsonStructure(['user' => ['id', 'fullName', 'email', 'phone', 'address', 'role'], 'token']);

    $this->assertDatabaseHas('users', ['email' => 'rio@example.com']);
});

test('records a real consent timestamp, not just a boolean', function () {
    $this->postJson('/api/register', [
        'fullName' => 'Rio Dela Cruz',
        'email' => 'rio@example.com',
        'phone' => '09171234567',
        'password' => 'password123',
        'privacyConsent' => true,
        'birthDate' => '1990-05-01', 'sex' => 'female',
    ])->assertCreated();

    $user = User::where('email', 'rio@example.com')->first();
    expect($user->privacy_consent_at)->not->toBeNull();
});

test('registration is refused without privacy consent — NFR:001 is now enforced, not just claimed', function () {
    $response = $this->postJson('/api/register', [
        'fullName' => 'Rio Dela Cruz',
        'email' => 'rio@example.com',
        'phone' => '09171234567',
        'password' => 'password123',
    ]);

    $response->assertUnprocessable()->assertJsonValidationErrors('privacyConsent');
    $this->assertDatabaseMissing('users', ['email' => 'rio@example.com']);
});

test('registration is refused if privacy consent is explicitly false', function () {
    $this->postJson('/api/register', [
        'fullName' => 'Rio Dela Cruz',
        'email' => 'rio@example.com',
        'phone' => '09171234567',
        'password' => 'password123',
        'privacyConsent' => false,
    ])->assertUnprocessable()->assertJsonValidationErrors('privacyConsent');
});

test('registration ignores a client-supplied role — cannot self-escalate to staff or admin', function () {
    $response = $this->postJson('/api/register', [
        'fullName' => 'Escalation Attempt',
        'email' => 'escalate@example.com',
        'phone' => '09171234567',
        'password' => 'password123',
        'privacyConsent' => true,
        'birthDate' => '1990-05-01', 'sex' => 'female',
        'role' => 'admin',
    ]);

    $response->assertCreated()->assertJsonPath('user.role', 'parishioner');
    $this->assertDatabaseHas('users', ['email' => 'escalate@example.com', 'role' => 'parishioner']);
});

test('rejects registration with a duplicate email', function () {
    User::factory()->create(['email' => 'rio@example.com']);

    $this->postJson('/api/register', [
        'fullName' => 'Rio Dela Cruz',
        'email' => 'rio@example.com',
        'password' => 'password123',
        'privacyConsent' => true,
        'birthDate' => '1990-05-01', 'sex' => 'female',
    ])->assertUnprocessable();
});

test('logs in with correct credentials and returns a token', function () {
    User::factory()->create([
        'email' => 'rio@example.com',
        'password' => Hash::make('password123'),
    ]);

    $this->postJson('/api/login', [
        'email' => 'rio@example.com',
        'password' => 'password123',
    ])->assertOk()->assertJsonStructure(['user', 'token']);
});

test('rejects login with the wrong password', function () {
    User::factory()->create([
        'email' => 'rio@example.com',
        'password' => Hash::make('password123'),
    ]);

    $this->postJson('/api/login', [
        'email' => 'rio@example.com',
        'password' => 'wrong-password',
    ])->assertUnprocessable();
});

test('me returns the authenticated user', function () {
    $user = User::factory()->create(['full_name' => 'Rio Dela Cruz']);

    $this->actingAs($user)
        ->getJson('/api/me')
        ->assertOk()
        ->assertJsonPath('fullName', 'Rio Dela Cruz');
});

test('me requires authentication', function () {
    $this->getJson('/api/me')->assertUnauthorized();
});

test('logout revokes the current token', function () {
    $user = User::factory()->create();
    $token = $user->createToken('test')->plainTextToken;

    $this->withHeader('Authorization', "Bearer {$token}")
        ->postJson('/api/logout')
        ->assertNoContent();

    expect($user->tokens()->count())->toBe(0);
});

test('login is rate-limited after repeated attempts', function () {
    User::factory()->create(['email' => 'target@example.com']);

    for ($i = 0; $i < 30; $i++) {
        $this->postJson('/api/login', ['email' => 'target@example.com', 'password' => 'wrong-password']);
    }

    $this->postJson('/api/login', ['email' => 'target@example.com', 'password' => 'wrong-password'])
        ->assertStatus(429);
});
