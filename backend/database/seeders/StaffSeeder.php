<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Log;

class StaffSeeder extends Seeder
{
    public function run(): void
    {
        // This runs on every deploy boot, so it must be safe to re-run against an already-seeded database.
        // There is no staff role any more. An old demo staff account is switched off rather than deleted, so its
        // history (audit entries, check-ins) stays readable.
        User::where('email', 'staff@example.com')->update(['is_active' => false]);

        $email = trim((string) config('app.admin_email'));
        $password = (string) config('app.admin_password');

        if ($email !== '' && $password !== '') {
            if (strlen($password) < 8) {
                Log::warning('ADMIN_PASSWORD is shorter than 8 characters: no admin account was created.');

                return;
            }

            // Created once. An existing account keeps the password it has now, so a change made in the app survives
            // every restart.
            User::firstOrCreate(
                ['email' => $email],
                ['full_name' => 'Parish Admin', 'role' => 'admin', 'password' => bcrypt($password)],
            );

            // The built-in demo admin must not stay usable beside the real one.
            if (strcasecmp($email, 'admin@example.com') !== 0) {
                User::where('email', 'admin@example.com')->update(['is_active' => false]);
            }

            return;
        }

        if (app()->environment('production')) {
            Log::warning('ADMIN_EMAIL and ADMIN_PASSWORD are not set: no admin account was created.');

            return;
        }

        // Local and test runs only.
        User::updateOrCreate(
            ['email' => 'admin@example.com'],
            ['full_name' => 'Admin User', 'role' => 'admin', 'password' => bcrypt('password')],
        );
    }
}
