<?php

use App\Models\User;
use Database\Seeders\StaffSeeder;
use Illuminate\Support\Facades\Hash;

function seedStaff(): void
{
    (new StaffSeeder)->run();
}

test('outside production, with no settings, the demo admin is created', function () {
    config(['app.admin_email' => null, 'app.admin_password' => null]);
    seedStaff();

    expect(User::where('email', 'admin@example.com')->where('role', 'admin')->exists())->toBeTrue();
});

test('in production with no settings, no admin is created', function () {
    app()->detectEnvironment(fn () => 'production');
    config(['app.admin_email' => null, 'app.admin_password' => null]);
    seedStaff();

    expect(User::where('role', 'admin')->count())->toBe(0);
});

test('with settings, the admin is created and the demo admin is switched off', function () {
    app()->detectEnvironment(fn () => 'production');
    User::factory()->create(['email' => 'admin@example.com', 'role' => 'admin', 'is_active' => true]);
    config(['app.admin_email' => 'office@parish.test', 'app.admin_password' => 'a-strong-passphrase']);
    seedStaff();

    $admin = User::where('email', 'office@parish.test')->first();
    expect($admin->role->value ?? $admin->role)->toBe('admin')
        ->and(Hash::check('a-strong-passphrase', $admin->password))->toBeTrue()
        ->and((bool) User::where('email', 'admin@example.com')->value('is_active'))->toBeFalse();
});

test('a second run never resets the password', function () {
    config(['app.admin_email' => 'office@parish.test', 'app.admin_password' => 'a-strong-passphrase']);
    seedStaff();
    User::where('email', 'office@parish.test')->update(['password' => Hash::make('changed-in-the-app')]);
    seedStaff();

    expect(Hash::check('changed-in-the-app', User::where('email', 'office@parish.test')->value('password')))->toBeTrue()
        ->and(User::where('email', 'office@parish.test')->count())->toBe(1);
});

test('a password under 8 characters creates nothing', function () {
    app()->detectEnvironment(fn () => 'production');
    config(['app.admin_email' => 'office@parish.test', 'app.admin_password' => 'short']);
    seedStaff();

    expect(User::where('email', 'office@parish.test')->exists())->toBeFalse();
});
