<?php

namespace App\Console\Commands;

use App\Enums\PaymentStatus;
use App\Models\Booking;
use App\Services\Booking\BookingStateMachine;
use App\Support\ParishClock;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

/**
 * Housekeeping only: availability already ignores expired holds the moment
 * they expire (Booking::holdingSlot), so a missed run never double-books —
 * this just flips the status and tells the parishioner.
 */
class ExpireBookingHolds extends Command
{
    protected $signature = 'bookings:expire-holds';

    protected $description = 'Cancel unpaid bookings past their payment hold and returned bookings not resubmitted within 7 days or before the appointment';

    public function handle(BookingStateMachine $bookings): int
    {
        $unpaid = Booking::whereIn('status', ['submitted', 'approved'])
            // Cash at the parish office holds the slot on the same deadline as GCash.
            ->whereIn('payment_status', PaymentStatus::awaitingValues())
            ->whereNotNull('payment_hold_expires_at')
            ->where('payment_hold_expires_at', '<=', now())
            ->get();

        $expiredUnpaid = 0;
        foreach ($unpaid as $booking) {
            try {
                if ($bookings->expireStaleHold($booking)) {
                    $expiredUnpaid++;
                }
            } catch (\Throwable $e) {
                Log::error('Failed to expire booking hold.', ['booking' => $booking->id, 'error' => $e->getMessage()]);
            }
        }

        // The 7-day lapse, or an appointment day that has come (expireStaleHold checks the exact start time).
        $returned = Booking::where('status', 'returned')
            ->where(fn ($q) => $q->where('returned_at', '<=', now()->subDays(7))->orWhere('appointment_date', '<=', ParishClock::todayString()))
            ->get();

        $expiredReturned = 0;
        foreach ($returned as $booking) {
            try {
                if ($bookings->expireStaleHold($booking)) {
                    $expiredReturned++;
                }
            } catch (\Throwable $e) {
                Log::error('Failed to expire booking hold.', ['booking' => $booking->id, 'error' => $e->getMessage()]);
            }
        }

        $this->info("Expired {$expiredUnpaid} unpaid and {$expiredReturned} returned booking(s).");

        return self::SUCCESS;
    }
}
