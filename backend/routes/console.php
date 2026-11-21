<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// A crashed run leaves its lock behind, and the default expiry is 24 hours: each job gets its own short one.
Schedule::command('bookings:expire-holds')->everyFifteenMinutes()->withoutOverlapping(30);

// Hourly is enough: the windows are read in parish time and close at the event, so a late run is still correct.
Schedule::command('reminders:send')->hourly()->withoutOverlapping(60);

Schedule::command('bookings:prune-walk-in-drafts')->daily()->withoutOverlapping(120);

Schedule::command('certificate-requests:prune-files')->daily()->withoutOverlapping(120);

// Files a staff member uploaded but never attached (a failed walk-in attach) are removed after 7 days.
Schedule::command('documents:prune-staff-uploads')->daily()->withoutOverlapping(120);

// No worker process runs on the host, so the scheduler drains the mail queue (QUEUE_CONNECTION=database).
Schedule::command('queue:work --stop-when-empty --tries=3 --max-time=50')->everyMinute()->withoutOverlapping(5);
