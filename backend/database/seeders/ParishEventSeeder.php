<?php

namespace Database\Seeders;

use App\Models\ParishEvent;
use Carbon\Carbon;
use Illuminate\Database\Seeder;

class ParishEventSeeder extends Seeder
{
    public function run(): void
    {
        // Staff manage events from the admin app; never wipe them on boot.
        if (ParishEvent::count() > 0) {
            return;
        }

        $nextSunday = Carbon::now()->next(Carbon::SUNDAY)->setTime(8, 0);
        if (Carbon::now()->isSunday()) {
            $nextSunday = Carbon::now()->setTime(8, 0);
        }

        $baptismDate = Carbon::now()->addDays(6)->setTime(9, 0);

        ParishEvent::create([
            'title' => 'Sunday Mass',
            'date' => $nextSunday,
            'location' => 'Main Chapel',
            'image_url' => '/mock-assets/sunday-mass.jpg',
            'category' => 'mass',
        ]);

        ParishEvent::create([
            'title' => 'Baptism Ceremony',
            'date' => $baptismDate,
            'location' => 'Baptistery',
            'image_url' => '/mock-assets/baptism.jpg',
            'category' => 'baptism',
        ]);
    }
}
