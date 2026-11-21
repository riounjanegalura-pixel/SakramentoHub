<?php

namespace Database\Seeders;

use App\Models\AppNotification;
use App\Models\User;
use Illuminate\Database\Seeder;

class NotificationSeeder extends Seeder
{
    public function run(): void
    {
        User::all()->each(function (User $user) {
            AppNotification::updateOrCreate(
                ['user_id' => $user->id, 'title' => 'Mass Reminder'],
                ['body' => 'Sunday Morning Mass starts in 2 hours', 'category' => 'today', 'icon' => 'calendar', 'read' => false],
            );
            AppNotification::updateOrCreate(
                ['user_id' => $user->id, 'title' => 'Baptism Schedule'],
                ['body' => 'Your baptism ceremony is confirmed for March 22', 'category' => 'today', 'icon' => 'booking', 'read' => false],
            );
            AppNotification::updateOrCreate(
                ['user_id' => $user->id, 'title' => 'Parish Announcement'],
                ['body' => 'New Lenten schedule has been posted', 'category' => 'earlier', 'icon' => 'announcement', 'read' => false],
            );
        });
    }
}
