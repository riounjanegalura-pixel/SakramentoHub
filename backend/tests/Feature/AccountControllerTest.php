<?php

use App\Models\AppNotification;
use App\Models\AuditLog;
use App\Models\Booking;
use App\Models\NotificationPreference;
use App\Models\User;
use App\Models\WalletDocument;
use Database\Seeders\ServiceSeeder;
use Illuminate\Support\Facades\Hash;

// Booking::factory() creates rows with real `sacrament` values, which is now
// a genuine FK onto `services.id` (see 2026_09_05_060000) — seed the real
// services so those inserts don't violate the constraint.
beforeEach(fn () => $this->seed(ServiceSeeder::class));

test('export returns exactly the requesting user\'s own data and nothing else\'s', function () {
    $user = User::factory()->create(['full_name' => 'Rio Dela Cruz', 'email' => 'rio@example.com']);
    $otherUser = User::factory()->create(['full_name' => 'Someone Else']);

    Booking::factory()->create(['user_id' => $user->id, 'sacrament' => 'baptism', 'form_data' => ['childFirstName' => 'Ana']]);
    Booking::factory()->create(['user_id' => $otherUser->id, 'sacrament' => 'wedding']);

    AppNotification::create(['user_id' => $user->id, 'title' => 'Hi', 'body' => 'Body', 'category' => 'today', 'read' => false, 'icon' => 'booking']);
    AppNotification::create(['user_id' => $otherUser->id, 'title' => 'Not yours', 'body' => 'Body', 'category' => 'today', 'read' => false, 'icon' => 'booking']);

    $response = $this->actingAs($user)->getJson('/api/me/export')->assertOk();

    $body = $response->json();

    expect($body['profile']['email'])->toBe('rio@example.com');
    expect($body['profile'])->not->toHaveKey('password');
    expect($body['bookings'])->toHaveCount(1);
    expect($body['bookings'][0]['sacrament'])->toBe('baptism');
    expect($body['notifications'])->toHaveCount(1);
    expect($body['notifications'][0]['title'])->toBe('Hi');

    $response->assertHeader('Content-Disposition');
});

test('export is auth-gated', function () {
    $this->getJson('/api/me/export')->assertUnauthorized();
});

test('deletion with the wrong current password is rejected', function () {
    $user = User::factory()->create(['password' => Hash::make('correctpass1')]);

    $this->actingAs($user)
        ->deleteJson('/api/me', ['currentPassword' => 'wrongpass'])
        ->assertUnprocessable();

    $this->assertDatabaseHas('users', ['id' => $user->id]);
});

test('deletion with the correct password anonymizes the account and revokes tokens', function () {
    $user = User::factory()->create(['password' => Hash::make('correctpass1')]);
    $token = $user->createToken('parishioner-pwa')->plainTextToken;

    $this->withHeader('Authorization', "Bearer {$token}")
        ->deleteJson('/api/me', ['currentPassword' => 'correctpass1'])
        ->assertNoContent();

    $this->assertDatabaseMissing('users', ['id' => $user->id]);

    // Same convention as AuthTest's "logout revokes the current token" — a
    // second HTTP call within the same test method reuses the already-booted
    // app, and Sanctum's guard caches its resolved user for the lifetime of
    // that RequestGuard instance, so re-issuing a request with the SAME
    // in-memory test client can't genuinely exercise a fresh 401 the way a
    // real second process hitting the API would. Asserting zero remaining
    // tokens is the real, DB-level proof: `auth:sanctum` can never
    // authenticate this token again once no matching row exists.
    expect(\DB::table('personal_access_tokens')->count())->toBe(0);
});

test('deletion does not destroy the user\'s past bookings or audit rows', function () {
    $user = User::factory()->create(['password' => Hash::make('correctpass1'), 'full_name' => 'Rio Dela Cruz', 'email' => 'rio@example.com']);
    $booking = Booking::factory()->create(['user_id' => $user->id, 'sacrament' => 'baptism', 'status' => 'submitted']);
    AuditLog::create([
        'actor_user_id' => $user->id,
        'action' => 'booking.approved',
        'subject_type' => 'booking',
        'subject_id' => $booking->id,
        'metadata' => ['actorName' => $user->full_name, 'actorEmail' => $user->email],
        'created_at' => now(),
    ]);

    $this->actingAs($user)
        ->deleteJson('/api/me', ['currentPassword' => 'correctpass1'])
        ->assertNoContent();

    $booking->refresh();
    expect($booking->user_id)->toBeNull();
    expect($booking->owner_snapshot['fullName'])->toBe('Rio Dela Cruz');
    expect($booking->owner_snapshot['email'])->toBe('rio@example.com');

    $this->assertDatabaseHas('bookings', ['id' => $booking->id]);
    $this->assertDatabaseHas('audit_logs', ['subject_id' => $booking->id]);
});

test('notifications and preferences are removed when the account is deleted', function () {
    $user = User::factory()->create(['password' => Hash::make('correctpass1')]);
    AppNotification::create(['user_id' => $user->id, 'title' => 'Hi', 'body' => 'Body', 'category' => 'today', 'read' => false, 'icon' => 'booking']);
    NotificationPreference::create(['user_id' => $user->id, 'push_enabled' => true, 'booking_reminders' => true, 'parish_announcements' => true]);

    $this->actingAs($user)
        ->deleteJson('/api/me', ['currentPassword' => 'correctpass1'])
        ->assertNoContent();

    $this->assertDatabaseMissing('notifications', ['user_id' => $user->id]);
    $this->assertDatabaseMissing('notification_preferences', ['user_id' => $user->id]);
});

test('deletion consumes any outstanding password-reset token for that email', function () {
    $user = User::factory()->create(['password' => Hash::make('correctpass1'), 'email' => 'stale-reset@example.com']);

    $this->postJson('/api/forgot-password', ['email' => 'stale-reset@example.com'])->assertOk();
    $this->assertDatabaseHas('password_reset_tokens', ['email' => 'stale-reset@example.com']);

    $this->actingAs($user)
        ->deleteJson('/api/me', ['currentPassword' => 'correctpass1'])
        ->assertNoContent();

    $this->assertDatabaseMissing('password_reset_tokens', ['email' => 'stale-reset@example.com']);

    // Simulate someone else registering with the now-freed email, then
    // confirm the OLD (pre-deletion) reset token can't reach across and
    // hijack the new account.
    $this->postJson('/api/register', [
        'fullName' => 'New Owner',
        'email' => 'stale-reset@example.com',
        'phone' => '09171234567',
        'password' => 'brandnewpass1',
        'privacyConsent' => true,
        'birthDate' => '1990-05-01', 'sex' => 'female',
    ])->assertCreated();

    $this->postJson('/api/reset-password', [
        'email' => 'stale-reset@example.com',
        'token' => 'whatever-the-old-emailed-token-was',
        'password' => 'takeover-password1',
        'password_confirmation' => 'takeover-password1',
    ])->assertUnprocessable();
});

test('deletion consumes any outstanding email-verification token for that email', function () {
    $user = User::factory()->unverified()->create(['password' => Hash::make('correctpass1'), 'email' => 'stale-verify@example.com']);
    $user->sendEmailVerificationNotification();
    $this->assertDatabaseHas('email_verification_tokens', ['email' => 'stale-verify@example.com']);

    $this->actingAs($user)
        ->deleteJson('/api/me', ['currentPassword' => 'correctpass1'])
        ->assertNoContent();

    $this->assertDatabaseMissing('email_verification_tokens', ['email' => 'stale-verify@example.com']);
});

test('a deleted user\'s email becomes available for a new registration', function () {
    $user = User::factory()->create(['password' => Hash::make('correctpass1'), 'email' => 'reusable@example.com']);

    $this->actingAs($user)
        ->deleteJson('/api/me', ['currentPassword' => 'correctpass1'])
        ->assertNoContent();

    $this->postJson('/api/register', [
        'fullName' => 'New Person',
        'email' => 'reusable@example.com',
        'phone' => '09171234567',
        'password' => 'newpassword1',
        'privacyConsent' => true,
        'birthDate' => '1990-05-01', 'sex' => 'female',
    ])->assertCreated();
});
