<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        // User::factory(10)->create();

        // updateOrCreate, not create — this seeder (and StaffSeeder below)
        // runs on every deploy boot (see backend/Dockerfile), so it must be
        // safe to re-run against an already-seeded database instead of
        // throwing a unique-email constraint violation the second time.
        User::updateOrCreate(
            ['email' => 'test@example.com'],
            ['full_name' => 'Test User', 'password' => bcrypt('password')],
        );

        $this->call(ServiceSeeder::class);
        $this->call(ParishSettingSeeder::class);
        $this->call(ParishEventSeeder::class);
        $this->call(StaffSeeder::class);
        $this->call(DemoBookingSeeder::class);

        // The large sample set that fills Reports, the register and the queue. It runs once per database, and a failure
        // here must never stop the server from starting.
        if (config('app.seed_demo_data')) {
            try {
                $this->call(DemoDataSeeder::class);
            } catch (\Throwable $e) {
                \Illuminate\Support\Facades\Log::warning('Sample data was not added: '.$e->getMessage());
            }
        }

        // NotificationSeeder is intentionally not called here — it depends on users
        // already existing. Run it manually after at least one user has registered:
        // php artisan db:seed --class=NotificationSeeder
    }
}
