<?php

use App\Models\User;
use Illuminate\Support\Facades\Hash;

test('updates the authenticated user profile', function () {
    $user = User::factory()->create(['full_name' => 'Old Name']);

    $this->actingAs($user)
        ->patchJson('/api/me', ['fullName' => 'New Name', 'address' => '123 Rizal St'])
        ->assertOk()
        ->assertJsonPath('fullName', 'New Name')
        ->assertJsonPath('address', '123 Rizal St');

    $this->assertDatabaseHas('users', ['id' => $user->id, 'full_name' => 'New Name']);
});

test('rejects an invalid phone number on profile update', function () {
    $user = User::factory()->create();

    $this->actingAs($user)
        ->patchJson('/api/me', ['phone' => '12345'])
        ->assertUnprocessable();
});

test('changes the password when the current password is correct', function () {
    $user = User::factory()->create(['password' => Hash::make('oldpassword1')]);

    $this->actingAs($user)
        ->patchJson('/api/me/password', [
            'currentPassword' => 'oldpassword1',
            'newPassword' => 'newpassword2',
        ])->assertNoContent();

    expect(Hash::check('newpassword2', $user->fresh()->password))->toBeTrue();
});

test('rejects a password change with the wrong current password', function () {
    $user = User::factory()->create(['password' => Hash::make('oldpassword1')]);

    $this->actingAs($user)
        ->patchJson('/api/me/password', [
            'currentPassword' => 'wrong',
            'newPassword' => 'newpassword2',
        ])->assertUnprocessable();
});

test('allows updating profile with the same email (email-ignore-self rule)', function () {
    $user = User::factory()->create(['email' => 'john@example.com', 'full_name' => 'John Doe']);

    $this->actingAs($user)
        ->patchJson('/api/me', ['email' => 'john@example.com', 'fullName' => 'John Updated'])
        ->assertOk()
        ->assertJsonPath('email', 'john@example.com')
        ->assertJsonPath('fullName', 'John Updated');

    $this->assertDatabaseHas('users', ['id' => $user->id, 'email' => 'john@example.com', 'full_name' => 'John Updated']);
});

test('rejects updating email to another user\'s email', function () {
    $user1 = User::factory()->create(['email' => 'user1@example.com']);
    $user2 = User::factory()->create(['email' => 'user2@example.com']);

    $this->actingAs($user1)
        ->patchJson('/api/me', ['email' => 'user2@example.com'])
        ->assertUnprocessable();
});
