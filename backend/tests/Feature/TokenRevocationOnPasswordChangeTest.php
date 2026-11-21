<?php

use App\Models\User;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;

test('changing the password signs out every other device and keeps this one', function () {
    $user = User::factory()->create(['password' => Hash::make('correctpass1')]);
    $here = $user->createToken('this-device')->plainTextToken;
    $other = $user->createToken('other-device')->plainTextToken;

    $this->withToken($here)
        ->patchJson('/api/me/password', [
            'currentPassword' => 'correctpass1',
            'newPassword' => 'brandnewpass1',
        ])->assertNoContent();

    // Each call is a fresh request: drop the guard's cached user so the token is looked up again.
    $this->app['auth']->forgetGuards();
    $this->withToken($other)->getJson('/api/me')->assertUnauthorized();

    $this->app['auth']->forgetGuards();
    $this->withToken($here)->getJson('/api/me')->assertOk();
});

test('a password reset signs out every device', function () {
    $user = User::factory()->create(['email' => 'reset-me@example.com', 'password' => Hash::make('correctpass1')]);
    $old = $user->createToken('phone')->plainTextToken;

    $token = Password::broker()->createToken($user);

    $this->postJson('/api/reset-password', [
        'email' => 'reset-me@example.com',
        'token' => $token,
        'password' => 'brandnewpass1',
        'passwordConfirmation' => 'brandnewpass1',
    ])->assertOk();

    $this->app['auth']->forgetGuards();
    $this->withToken($old)->getJson('/api/me')->assertUnauthorized();
});
