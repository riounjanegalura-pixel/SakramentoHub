<?php

use App\Models\User;
use App\Notifications\ResetPasswordNotification;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Password;

test('requesting a reset for a real email creates a token and dispatches the notification', function () {
    Notification::fake();

    $user = User::factory()->create(['email' => 'rio@example.com']);

    $this->postJson('/api/forgot-password', ['email' => 'rio@example.com'])
        ->assertOk()
        ->assertJsonStructure(['message']);

    $this->assertDatabaseHas('password_reset_tokens', ['email' => 'rio@example.com']);
    Notification::assertSentTo($user, ResetPasswordNotification::class);
});

test('requesting a reset for an unknown email still returns a generic success response', function () {
    Notification::fake();

    $this->postJson('/api/forgot-password', ['email' => 'nobody@example.com'])
        ->assertOk()
        ->assertJsonStructure(['message']);

    // No user-enumeration leak: same response, and nothing was dispatched.
    Notification::assertNothingSent();
});

test('resetting with a valid token changes the password and consumes the token', function () {
    $user = User::factory()->create(['email' => 'rio@example.com', 'password' => Hash::make('old-password1')]);

    $this->postJson('/api/forgot-password', ['email' => 'rio@example.com'])->assertOk();

    $record = DB::table('password_reset_tokens')->where('email', 'rio@example.com')->first();
    expect($record)->not->toBeNull();

    // The stored value is hashed by the broker — recover the plaintext token
    // the only way a test can: capture it from the notification itself.
    Notification::fake();
    $token = Password::createToken($user);

    $this->postJson('/api/reset-password', [
        'token' => $token,
        'email' => 'rio@example.com',
        'password' => 'new-password1',
        'passwordConfirmation' => 'new-password1',
    ])->assertOk();

    $this->postJson('/api/login', ['email' => 'rio@example.com', 'password' => 'old-password1'])
        ->assertUnprocessable();

    $this->postJson('/api/login', ['email' => 'rio@example.com', 'password' => 'new-password1'])
        ->assertOk();

    // Consumed — cannot be reused.
    $this->postJson('/api/reset-password', [
        'token' => $token,
        'email' => 'rio@example.com',
        'password' => 'another-password1',
        'passwordConfirmation' => 'another-password1',
    ])->assertUnprocessable();
});

test('resetting with an invalid token is rejected with a 422', function () {
    User::factory()->create(['email' => 'rio@example.com']);

    $this->postJson('/api/reset-password', [
        'token' => 'not-a-real-token',
        'email' => 'rio@example.com',
        'password' => 'new-password1',
        'passwordConfirmation' => 'new-password1',
    ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('token');
});

test('reset-password requires a matching password confirmation', function () {
    User::factory()->create(['email' => 'rio@example.com']);

    $this->postJson('/api/reset-password', [
        'token' => 'whatever',
        'email' => 'rio@example.com',
        'password' => 'new-password1',
        'passwordConfirmation' => 'different-password',
    ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('passwordConfirmation');
});
