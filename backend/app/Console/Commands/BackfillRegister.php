<?php

namespace App\Console\Commands;

use App\Models\Booking;
use App\Services\Register\ParishRegister;
use Illuminate\Console\Command;

/**
 * Records a register entry for every completed booking that has none, oldest
 * ceremony first so the numbers follow the calendar. Safe to run on every boot.
 */
class BackfillRegister extends Command
{
    protected $signature = 'register:backfill';

    protected $description = 'Record a register entry for every completed booking that does not have one';

    public function handle(ParishRegister $register): int
    {
        $bookings = Booking::where('status', 'completed')->whereDoesntHave('registerEntry')->get()
            ->map(fn (Booking $b) => [$b, $b->appointmentDateString() ?? $b->updated_at->setTimezone(config('app.parish_timezone'))->toDateString()])
            ->sortBy(fn (array $pair) => $pair[1].'|'.$pair[0]->reference_number);

        $recorded = 0;
        foreach ($bookings as [$booking, $date]) {
            $register->record($booking, null, $date); // its own transaction; a failure stops the run, a rerun resumes
            $recorded++;
        }

        $this->info("Recorded {$recorded} register ".($recorded === 1 ? 'entry' : 'entries').'.');

        return self::SUCCESS;
    }
}
