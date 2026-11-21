<?php

namespace App\Services\Booking;

use App\Models\Booking;
use App\Models\ParishSetting;
use App\Services\PayMongo\PayMongoClient;
use App\Services\PayMongo\PayMongoException;

/** One place that opens (or resumes) a booking's GCash checkout, for the parishioner and for the office. */
class CheckoutSessions
{
    public function __construct(private PayMongoClient $paymongo) {}

    /**
     * @return array{id: string, checkout_url: string, status: string|null}
     *
     * @throws PayMongoException
     */
    public function for(Booking $booking): array
    {
        return $this->reusable($booking) ?? $this->create($booking);
    }

    /**
     * Hands back the booking's existing session while it's still `active`, so
     * tapping "Pay" twice (or returning from a cancelled checkout and trying
     * again) doesn't open two live checkouts that could both be paid.
     */
    private function reusable(Booking $booking): ?array
    {
        if (! $booking->paymongo_checkout_session_id) {
            return null;
        }

        try {
            $session = $this->paymongo->retrieveCheckoutSession($booking->paymongo_checkout_session_id);
        } catch (PayMongoException) {
            return null; // expired/unknown — make a fresh one
        }

        return $session['status'] === 'active' ? $session : null;
    }

    private function create(Booking $booking): array
    {
        $sacrament = ucwords(str_replace('-', ' ', $booking->sacrament));
        $owner = trim((string) $booking->ownerName());
        $base = rtrim(config('app.parishioner_url'), '/');
        $query = http_build_query(['bookingId' => $booking->id]);
        // A walk-in pays on their own phone at the counter, maybe not signed in
        // (even when the booking is linked to an account): a page that needs no login.
        [$success, $cancel] = $booking->channel === 'walk_in'
            ? ["{$base}/payment/received", "{$base}/payment/received?cancelled=1"]
            : ["{$base}/payment/success?{$query}", "{$base}/payment/cancelled?{$query}"];

        $session = $this->paymongo->createCheckoutSession([
            'amount_centavos' => (int) $booking->amount_due_centavos,
            'name' => $owner !== '' ? "{$sacrament} Fee — for {$owner}" : "{$sacrament} Fee",
            'description' => "{$sacrament} booking {$booking->reference_number}".($owner !== '' ? " for {$owner}" : '').' — '.ParishSetting::parishName(),
            'reference_number' => (string) $booking->reference_number,
            'statement_descriptor' => ParishSetting::parishName(),
            'success_url' => $success,
            'cancel_url' => $cancel,
            // Set server-side and returned inside the signed webhook payload —
            // how the webhook finds the booking without trusting the browser.
            'metadata' => ['booking_id' => $booking->id],
            // A walk-in may have no email: leave the key out rather than send null.
            'billing' => array_filter(['name' => $booking->ownerName(), 'email' => $booking->ownerEmail()]),
        ]);

        $booking->update(['paymongo_checkout_session_id' => $session['id']]);

        return $session;
    }
}
