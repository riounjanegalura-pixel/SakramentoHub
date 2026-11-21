<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\Donation;
use App\Services\Booking\BookingStateMachine;
use App\Services\PayMongo\WebhookSignature;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

/**
 * POST /api/webhooks/paymongo — the ONLY thing that marks a booking paid.
 *
 * Security:
 *  1. Fails closed: no PAYMONGO_WEBHOOK_SECRET configured → 503, nothing processed.
 *  2. Paymongo-Signature HMAC-SHA256 over "<t>.<raw body>" must match the
 *     test (`te`) or live (`li`) signature for the configured mode, compared
 *     in constant time, with a timestamp tolerance against replays → 401 otherwise.
 *  3. Events whose `livemode` disagrees with the configured mode are ignored.
 *  4. The booking is located by `metadata.booking_id`, which our own server
 *     set when creating the checkout session (and which is covered by the
 *     signature), and the amount PayMongo reports as paid must cover the
 *     booking's server-computed `amount_due_centavos`.
 *
 * Signature verification happens here; every payment-state change goes
 * through BookingStateMachine::recordPayment(), which locks the booking,
 * dedupes by payment id and records money it can't apply as refund due.
 * Events we can't act on (unknown booking, irrelevant type, no paid payment)
 * get a 200 — retrying them would never succeed, so there's no point asking
 * PayMongo to.
 */
class PayMongoWebhookController extends Controller
{
    private const PAID_EVENT = 'checkout_session.payment.paid';
    /** Fired for a direct GCash payment (a payment intent), which has no checkout session. */
    private const PAYMENT_PAID_EVENT = 'payment.paid';

    public function __construct(private BookingStateMachine $bookings) {}

    public function __invoke(Request $request): JsonResponse
    {
        $secret = (string) config('paymongo.webhook_secret');
        if ($secret === '') {
            Log::warning('PayMongo webhook received but PAYMONGO_WEBHOOK_SECRET is not set; rejecting.');

            return response()->json(['message' => 'Webhook not configured.'], 503);
        }

        $live = config('paymongo.mode') === 'live';
        $rawBody = $request->getContent();

        if (! WebhookSignature::verify(
            $request->header('Paymongo-Signature'),
            $rawBody,
            $secret,
            $live,
            (int) config('paymongo.webhook_tolerance_seconds'),
        )) {
            Log::warning('PayMongo webhook rejected: invalid or missing signature.', ['ip' => $request->ip()]);

            return response()->json(['message' => 'Invalid signature.'], 401);
        }

        $event = json_decode($rawBody, true);
        if (! is_array($event)) {
            return response()->json(['message' => 'Malformed payload.'], 400);
        }

        $type = data_get($event, 'data.attributes.type');
        if ($type !== self::PAID_EVENT && $type !== self::PAYMENT_PAID_EVENT) {
            return $this->ack('ignored', "Unhandled event type: {$type}");
        }

        if ((bool) data_get($event, 'data.attributes.livemode') !== $live) {
            return $this->ack('ignored', 'Event mode does not match configured PAYMONGO_MODE.');
        }

        $session = (array) data_get($event, 'data.attributes.data', []);
        if ($type === self::PAYMENT_PAID_EVENT) {
            $session = $this->sessionFromPayment($session);
        }

        return $this->handlePaid($session, (string) data_get($event, 'data.id'));
    }

    /**
     * Shapes a `payment.paid` payment like a paid checkout session, so one code path records both. The booking or
     * donation is found by the payment intent id we stored when we started the payment (server-set, so not forgeable
     * through the browser), falling back to the metadata we put on the intent.
     */
    private function sessionFromPayment(array $payment): array
    {
        $intentId = (string) data_get($payment, 'attributes.payment_intent_id', '');
        $metadata = (array) data_get($payment, 'attributes.metadata', []);

        if ($intentId !== '') {
            if ($booking = Booking::where('paymongo_checkout_session_id', $intentId)->first()) {
                $metadata['booking_id'] = $booking->id;
            } elseif ($donation = Donation::where('paymongo_checkout_session_id', $intentId)->first()) {
                $metadata['donation_id'] = $donation->id;
            }
        }

        return [
            'id' => $intentId !== '' ? $intentId : data_get($payment, 'id'),
            'attributes' => ['metadata' => $metadata, 'payments' => [$payment]],
        ];
    }

    private function handlePaid(array $session, string $eventId): JsonResponse
    {
        if ($donationId = data_get($session, 'attributes.metadata.donation_id')) {
            return $this->handleDonation((string) $donationId, $session, $eventId);
        }

        $bookingId = data_get($session, 'attributes.metadata.booking_id');
        $sessionId = data_get($session, 'id');
        $booking = $bookingId ? Booking::find($bookingId) : null;

        if (! $booking) {
            Log::warning('PayMongo paid event for unknown booking.', compact('bookingId', 'sessionId', 'eventId'));

            return $this->ack('ignored', 'Unknown booking.');
        }

        $paid = collect(data_get($session, 'attributes.payments', []))
            ->filter(fn ($p) => data_get($p, 'attributes.status') === 'paid');
        $amount = (int) $paid->sum(fn ($p) => (int) data_get($p, 'attributes.amount', 0));

        if ($paid->isEmpty() || $amount <= 0) {
            Log::warning('PayMongo paid event without a paid payment.', ['booking' => $booking->id, 'sessionId' => $sessionId, 'eventId' => $eventId]);

            return $this->ack('ignored', 'No paid payment in event.');
        }

        $result = $this->bookings->recordPayment($booking, $sessionId, $paid->first()['id'] ?? null, $amount, $eventId);

        return $this->ack($result, match ($result) {
            'processed' => 'Booking marked paid.',
            'refund_due' => 'Payment recorded as refund due.',
            'duplicate' => 'Payment already recorded.',
        });
    }

    /** A gift is simpler than a booking: mark it paid once and ignore a repeat delivery. */
    private function handleDonation(string $donationId, array $session, string $eventId): JsonResponse
    {
        $donation = Donation::find($donationId);
        if (! $donation) {
            Log::warning('PayMongo paid event for unknown donation.', compact('donationId', 'eventId'));

            return $this->ack('ignored', 'Unknown donation.');
        }

        $paid = collect(data_get($session, 'attributes.payments', []))
            ->filter(fn ($p) => data_get($p, 'attributes.status') === 'paid');
        $amount = (int) $paid->sum(fn ($p) => (int) data_get($p, 'attributes.amount', 0));
        if ($paid->isEmpty() || $amount <= 0) {
            return $this->ack('ignored', 'No paid payment in event.');
        }
        if ($donation->status === 'paid') {
            return $this->ack('duplicate', 'Donation already recorded.');
        }

        $donation->update([
            'status' => 'paid',
            'paymongo_payment_id' => $paid->first()['id'] ?? null,
            'amount_centavos' => $amount,
            'paid_at' => now(),
        ]);

        return $this->ack('processed', 'Donation marked paid.');
    }

    private function ack(string $result, string $detail): JsonResponse
    {
        return response()->json(['received' => true, 'result' => $result, 'detail' => $detail]);
    }
}
