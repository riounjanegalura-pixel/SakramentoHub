<?php

use App\Models\User;
use App\Notifications\VerifyEmailNotification;
use Database\Seeders\ParishSettingSeeder;
use Database\Seeders\ServiceSeeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;

// Submitting a booking below goes through POST /api/bookings, which creates a
// real `sacrament` value that's now a genuine FK onto `services.id` (see
// 2026_09_05_060000) — seed the real services so that insert doesn't violate
// the constraint.
beforeEach(function () {
    $this->seed(ServiceSeeder::class);
    $this->seed(ParishSettingSeeder::class);
    Storage::fake('local');
    Carbon::setTestNow(Carbon::parse('2026-11-02 00:00:00', 'UTC'));
});

afterEach(fn () => Carbon::setTestNow());

test('registering leaves email_verified_at null and dispatches a verification notification', function () {
    Notification::fake();

    $response = $this->postJson('/api/register', [
        'fullName' => 'Rio Dela Cruz',
        'email' => 'rio@example.com',
        'phone' => '09171234567',
        'password' => 'password123',
        'privacyConsent' => true,
        'birthDate' => '1990-05-01', 'sex' => 'female',
    ])->assertCreated();

    expect($response->json('user.emailVerifiedAt'))->toBeNull();

    $user = User::where('email', 'rio@example.com')->first();
    expect($user->email_verified_at)->toBeNull();

    Notification::assertSentTo($user, VerifyEmailNotification::class);
    $this->assertDatabaseHas('email_verification_tokens', ['email' => 'rio@example.com']);
});

test('resend sends a fresh verification email for an unverified user', function () {
    Notification::fake();

    $user = User::factory()->unverified()->create();
    $token = $user->createToken('test')->plainTextToken;

    $this->withHeader('Authorization', "Bearer {$token}")
        ->postJson('/api/email/verification-notification')
        ->assertOk();

    Notification::assertSentTo($user, VerifyEmailNotification::class);
});

test('resend is a no-op success for an already-verified user', function () {
    Notification::fake();

    $user = User::factory()->create(); // verified by default
    $token = $user->createToken('test')->plainTextToken;

    $this->withHeader('Authorization', "Bearer {$token}")
        ->postJson('/api/email/verification-notification')
        ->assertOk();

    Notification::assertNothingSent();
});

test('resend requires authentication', function () {
    $this->postJson('/api/email/verification-notification')->assertUnauthorized();
});

test('resend is rate-limited', function () {
    $user = User::factory()->unverified()->create();
    $token = $user->createToken('test')->plainTextToken;

    for ($i = 0; $i < 6; $i++) {
        $this->withHeader('Authorization', "Bearer {$token}")->postJson('/api/email/verification-notification');
    }

    $this->withHeader('Authorization', "Bearer {$token}")
        ->postJson('/api/email/verification-notification')
        ->assertStatus(429);
});

test('verifying with a valid token sets email_verified_at and consumes the token', function () {
    $user = User::factory()->unverified()->create(['email' => 'rio@example.com']);
    $user->sendEmailVerificationNotification();

    $record = DB::table('email_verification_tokens')->where('email', 'rio@example.com')->first();
    expect($record)->not->toBeNull();

    // Recover the plaintext token the only real way a test can: intercept it
    // via a fake before dispatch, capturing what the notification received.
    Notification::fake();
    $user->sendEmailVerificationNotification();
    $capturedToken = null;
    Notification::assertSentTo($user, VerifyEmailNotification::class, function ($notification) use (&$capturedToken) {
        $capturedToken = (fn () => $this->token)->call($notification);

        return true;
    });

    $this->postJson('/api/email/verify', ['email' => 'rio@example.com', 'token' => $capturedToken])
        ->assertOk();

    $user->refresh();
    expect($user->email_verified_at)->not->toBeNull();

    // Consumed — cannot be reused.
    $this->postJson('/api/email/verify', ['email' => 'rio@example.com', 'token' => $capturedToken])
        ->assertUnprocessable();
});

test('verifying with an invalid token 422s', function () {
    User::factory()->unverified()->create(['email' => 'rio@example.com']);

    $this->postJson('/api/email/verify', ['email' => 'rio@example.com', 'token' => 'bogus'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('token');
});

test('verifying with an expired token 422s', function () {
    $user = User::factory()->unverified()->create(['email' => 'rio@example.com']);

    DB::table('email_verification_tokens')->updateOrInsert(
        ['email' => 'rio@example.com'],
        ['token' => Hash::make('a-real-token'), 'created_at' => now()->subMinutes(61)]
    );

    $this->postJson('/api/email/verify', ['email' => 'rio@example.com', 'token' => 'a-real-token'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('token');
});

test('an unverified parishioner can log in and view their own bookings', function () {
    $user = User::factory()->unverified()->create();
    $token = $user->createToken('test')->plainTextToken;

    $this->withHeader('Authorization', "Bearer {$token}")
        ->getJson('/api/bookings')
        ->assertOk();
});

test('an unverified parishioner is blocked from submitting a booking', function () {
    $user = User::factory()->unverified()->create();
    $token = $user->createToken('test')->plainTextToken;

    $booking = \App\Models\Booking::create([
        'user_id' => $user->id,
        'sacrament' => 'baptism',
        'status' => 'draft',
        'form_data' => [],
    ]);

    $response = $this->withHeader('Authorization', "Bearer {$token}")
        ->patchJson("/api/bookings/{$booking->id}/submit")
        ->assertStatus(403);

    expect($response->json('message'))->toContain('verify');

    $booking->refresh();
    expect($booking->status->value)->toBe('draft');
});

test('a verified parishioner can submit a booking', function () {
    $user = User::factory()->create(); // verified by default
    $token = $user->createToken('test')->plainTextToken;

    $booking = \App\Models\Booking::create([
        'user_id' => $user->id,
        'sacrament' => 'funeral',
        'status' => 'draft',
        'form_data' => formDataFixture('funeral/valid-basic', $user->id),
        'appointment_date' => '2026-11-03',
        'appointment_start' => '10:00',
    ]);

    $this->withHeader('Authorization', "Bearer {$token}")
        ->patchJson("/api/bookings/{$booking->id}/submit")
        ->assertOk()
        ->assertJsonPath('status', 'submitted');
});

test('the emailed 6-digit code verifies the signed-in account, once', function () {
    $user = User::factory()->create(['email' => 'code@example.com', 'email_verified_at' => null]);
    DB::table('email_verification_tokens')->insert([
        'email' => 'code@example.com', 'token' => Hash::make('unused'), 'code' => Hash::make('123456'), 'created_at' => now(),
    ]);

    $this->actingAs($user)->postJson('/api/email/verify-code', ['code' => '000000'])
        ->assertUnprocessable()->assertJsonValidationErrors('code');
    expect($user->fresh()->email_verified_at)->toBeNull();

    $this->actingAs($user)->postJson('/api/email/verify-code', ['code' => '123456'])->assertOk()->assertJson(['message' => 'Email verified.']);
    expect($user->fresh()->email_verified_at)->not->toBeNull();
    $this->assertDatabaseMissing('email_verification_tokens', ['email' => 'code@example.com']);
});

test('an expired code is refused', function () {
    $user = User::factory()->create(['email' => 'late@example.com', 'email_verified_at' => null]);
    DB::table('email_verification_tokens')->insert([
        'email' => 'late@example.com', 'token' => Hash::make('unused'), 'code' => Hash::make('654321'), 'created_at' => now()->subMinutes(61),
    ]);

    $this->actingAs($user)->postJson('/api/email/verify-code', ['code' => '654321'])->assertUnprocessable();
    expect($user->fresh()->email_verified_at)->toBeNull();
});

test('the code route needs a signed-in account and six digits', function () {
    $this->postJson('/api/email/verify-code', ['code' => '123456'])->assertUnauthorized();
    $user = User::factory()->create(['email_verified_at' => null]);
    $this->actingAs($user)->postJson('/api/email/verify-code', ['code' => '12ab'])->assertUnprocessable();
});

test('the verification email carries the code as well as the link', function () {
    $user = User::factory()->create(['email' => 'mail@example.com', 'email_verified_at' => null]);
    $text = (new VerifyEmailNotification('tok', '482916'))->toMail($user)->introLines;

    expect(implode(' ', array_map('strval', $text)))->toContain('482916');
});
