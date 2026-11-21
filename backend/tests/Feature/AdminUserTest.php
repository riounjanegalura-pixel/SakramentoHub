<?php

use App\Models\AuditLog;
use App\Models\User;

test('an admin can list users, filtered by role', function () {
    $admin = User::factory()->create(['role' => 'admin']);
    User::factory()->create(['role' => 'parishioner']);
    $staff = User::factory()->create(['role' => 'staff']);

    $response = $this->actingAs($admin)->getJson('/api/admin/users?role=staff')->assertOk();

    $ids = collect($response->json('data'))->pluck('id');
    expect($ids)->toContain($staff->id);
    expect($ids)->not->toContain($admin->id);
});

test('an admin can search users by name or email', function () {
    $admin = User::factory()->create(['role' => 'admin']);
    $target = User::factory()->create(['full_name' => 'Juana Dela Cruz', 'email' => 'juana@example.com']);
    User::factory()->create(['full_name' => 'Someone Else', 'email' => 'else@example.com']);

    $response = $this->actingAs($admin)->getJson('/api/admin/users?search=juana')->assertOk();

    $ids = collect($response->json('data'))->pluck('id');
    expect($ids)->toContain($target->id);
    expect($ids)->toHaveCount(1);
});

test('a staff account is 403d out of user-management routes', function () {
    $staff = User::factory()->create(['role' => 'staff']);

    $this->actingAs($staff)->getJson('/api/admin/users')->assertForbidden();
    $this->actingAs($staff)->postJson('/api/admin/users', [
        'fullName' => 'New Staff', 'email' => 'new@example.com', 'password' => 'password123', 'role' => 'staff',
    ])->assertForbidden();
});

test('a parishioner is 403d out of user-management routes', function () {
    $parishioner = User::factory()->create(['role' => 'parishioner']);

    $this->actingAs($parishioner)->getJson('/api/admin/users')->assertForbidden();
});

test('an admin can create an admin account, and it can actually log in and hit a role-gated route', function () {
    $admin = User::factory()->create(['role' => 'admin']);

    $response = $this->actingAs($admin)->postJson('/api/admin/users', [
        'fullName' => 'Newly Hired Admin',
        'email' => 'newstaff@example.com',
        'phone' => '09171234567',
        'password' => 'password123',
        'role' => 'admin',
    ])->assertCreated();

    expect($response->json('role'))->toBe('admin');
    expect($response->json('isActive'))->toBeTrue();
    expect($response->json('emailVerifiedAt'))->not->toBeNull();

    $login = $this->postJson('/api/login', [
        'email' => 'newstaff@example.com',
        'password' => 'password123',
    ])->assertOk();

    $token = $login->json('token');
    $this->withHeader('Authorization', "Bearer {$token}")
        ->getJson('/api/admin/bookings')
        ->assertOk();

    expect(AuditLog::where('action', 'user.created')->exists())->toBeTrue();
});

test('an admin can create another admin account', function () {
    $admin = User::factory()->create(['role' => 'admin']);

    $this->actingAs($admin)->postJson('/api/admin/users', [
        'fullName' => 'Second Admin', 'email' => 'admin2@example.com', 'password' => 'password123', 'role' => 'admin',
    ])->assertCreated()->assertJsonPath('role', 'admin');
});

test('creating a user cannot be given the parishioner role through this endpoint', function () {
    $admin = User::factory()->create(['role' => 'admin']);

    $this->actingAs($admin)->postJson('/api/admin/users', [
        'fullName' => 'Sneaky', 'email' => 'sneaky@example.com', 'password' => 'password123', 'role' => 'parishioner',
    ])->assertStatus(422);
});

test('the public register endpoint never accepts a role field from the request', function () {
    $this->postJson('/api/register', [
        'fullName' => 'Self Registered',
        'email' => 'selfreg@example.com',
        'password' => 'password123',
        'privacyConsent' => true,
        'birthDate' => '1990-05-01', 'sex' => 'female',
        'role' => 'admin',
    ])->assertCreated();

    $user = User::where('email', 'selfreg@example.com')->first();
    expect($user->role)->toBe('parishioner');
});

test('an admin can change another user\'s role, reflected in a subsequent me call', function () {
    $admin = User::factory()->create(['role' => 'admin']);
    $staff = User::factory()->create(['role' => 'parishioner']);

    $this->actingAs($admin)->patchJson("/api/admin/users/{$staff->id}/role", ['role' => 'admin'])
        ->assertOk()->assertJsonPath('role', 'admin');

    $this->actingAs($staff->fresh())->getJson('/api/me')->assertJsonPath('role', 'admin');
    expect(AuditLog::where('action', 'user.role_changed')->exists())->toBeTrue();
});

test('an invalid role value is rejected', function () {
    $admin = User::factory()->create(['role' => 'admin']);
    $staff = User::factory()->create(['role' => 'staff']);

    $this->actingAs($admin)->patchJson("/api/admin/users/{$staff->id}/role", ['role' => 'superadmin'])
        ->assertStatus(422);
});

test('the last remaining admin cannot be demoted', function () {
    $admin = User::factory()->create(['role' => 'admin']);

    $this->actingAs($admin)->patchJson("/api/admin/users/{$admin->id}/role", ['role' => 'parishioner'])
        ->assertStatus(422);

    expect($admin->fresh()->role)->toBe('admin');
});

test('an admin can be demoted when another active admin still exists', function () {
    $admin1 = User::factory()->create(['role' => 'admin']);
    $admin2 = User::factory()->create(['role' => 'admin']);

    $this->actingAs($admin1)->patchJson("/api/admin/users/{$admin2->id}/role", ['role' => 'parishioner'])
        ->assertOk()->assertJsonPath('role', 'parishioner');
});

test('deactivating a user prevents them from logging in, but their history is untouched', function () {
    $admin = User::factory()->create(['role' => 'admin']);
    $staff = User::factory()->create(['role' => 'staff', 'password' => bcrypt('password123')]);

    $this->actingAs($admin)->patchJson("/api/admin/users/{$staff->id}/deactivate")
        ->assertOk()->assertJsonPath('isActive', false);

    $this->postJson('/api/login', ['email' => $staff->email, 'password' => 'password123'])
        ->assertStatus(422);

    expect(User::find($staff->id))->not->toBeNull();
});

test('the last remaining active admin cannot be deactivated', function () {
    $admin = User::factory()->create(['role' => 'admin']);

    $this->actingAs($admin)->patchJson("/api/admin/users/{$admin->id}/deactivate")
        ->assertStatus(422);
});

test('deactivating a user revokes their existing tokens, not just future logins', function () {
    // Regression test: deactivate() previously only set is_active=false and
    // relied on AuthController::login() to reject a FUTURE login attempt —
    // a token issued BEFORE deactivation kept authorizing every request for
    // up to 30 days (config/sanctum.php's expiration), since nothing ever
    // checked is_active on an already-issued token. Confirmed live against
    // a real running server before this fix: the old token still returned
    // HTTP 200 on /api/admin/bookings after deactivation.
    $admin = User::factory()->create(['role' => 'admin']);
    $staff = User::factory()->create(['role' => 'staff']);
    $staffToken = $staff->createToken('staff-session')->plainTextToken;

    // The token genuinely works before deactivation.
    $this->withHeader('Authorization', "Bearer {$staffToken}")
        ->getJson('/api/admin/bookings')
        ->assertOk();

    $this->actingAs($admin)->patchJson("/api/admin/users/{$staff->id}/deactivate")->assertOk();

    // Real, DB-level proof the token is gone — see AccountControllerTest's
    // identical reasoning for why this is the correct assertion instead of
    // a second HTTP call reusing the same in-memory test client.
    expect(\DB::table('personal_access_tokens')->where('tokenable_id', $staff->id)->count())->toBe(0);
});

test('EnsureAccountIsActive middleware rejects a still-valid token if is_active is false, independent of deactivate() remembering to revoke it', function () {
    // Defense-in-depth check: simulates is_active going false through some
    // OTHER path than Admin\UserController::deactivate() (a future mutation
    // that forgets to also call tokens()->delete(), exactly like this one
    // originally did) — the middleware itself must still reject the token.
    $staff = User::factory()->create(['role' => 'staff', 'is_active' => false]);
    $token = $staff->createToken('staff-session')->plainTextToken;

    $this->withHeader('Authorization', "Bearer {$token}")
        ->getJson('/api/me')
        ->assertUnauthorized();
});

test('a deactivated user can be reactivated and log in again', function () {
    $admin = User::factory()->create(['role' => 'admin']);
    $staff = User::factory()->create(['role' => 'staff', 'is_active' => false, 'password' => bcrypt('password123')]);

    $this->actingAs($admin)->patchJson("/api/admin/users/{$staff->id}/activate")
        ->assertOk()->assertJsonPath('isActive', true);

    $this->postJson('/api/login', ['email' => $staff->email, 'password' => 'password123'])->assertOk();
});

test('user search finds Ñ and accented names whatever case is typed', function () {
    $admin = User::factory()->create(['role' => 'admin']);
    User::factory()->create(['full_name' => 'Ñiguez Dela Peña', 'email' => 'nino@example.org']);
    User::factory()->create(['full_name' => 'Pedro Reyes', 'email' => 'pedro@example.org']);

    foreach (['ÑIGUEZ', 'ñiguez', 'PEÑA', 'peña'] as $term) {
        $res = $this->actingAs($admin)->getJson('/api/admin/users?search='.urlencode($term));
        expect($res->json('data'))->toHaveCount(1, "term {$term}");
    }
});

test('there is no staff role: it cannot be created or assigned', function () {
    $admin = User::factory()->create(['role' => 'admin']);
    $user = User::factory()->create(['role' => 'parishioner']);

    $this->actingAs($admin)->postJson('/api/admin/users', [
        'fullName' => 'Someone', 'email' => 'someone@example.com', 'password' => 'password123', 'role' => 'staff',
    ])->assertStatus(422);

    $this->actingAs($admin)->patchJson("/api/admin/users/{$user->id}/role", ['role' => 'staff'])->assertStatus(422);
});
