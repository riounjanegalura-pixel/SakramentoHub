<?php

namespace App\Http\Controllers\Api;

use App\Enums\BookingStatus;
use App\Enums\PaymentStatus;
use App\Http\Controllers\Controller;
use App\Http\Resources\BookingResource;
use App\Models\Booking;
use App\Services\Booking\BookingStateMachine;
use App\Services\Booking\CheckoutSessions;
use App\Services\PayMongo\PayMongoClient;
use App\Services\PayMongo\PayMongoException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

/**
 * Starts (or resumes) GCash payment for a submitted booking via a PayMongo
 * Checkout Session. The parishioner app redirects the browser to the returned
 * `checkoutUrl`; PayMongo sends them back to /payment/success or
 * /payment/cancelled afterwards. That return trip is NOT proof of payment —
 * only the signed webhook (PayMongoWebhookController) marks a booking paid.
 */
class PaymentController extends Controller
{
    public function initiate(Request $request, string $id, PayMongoClient $paymongo, CheckoutSessions $sessions)
    {
        $booking = Booking::where('user_id', $request->user()->id)->visibleToOwner()->findOrFail($id);

        if ($blocked = $this->notPayable($booking)) {
            return $blocked;
        }

        // Demo mode: our own mock GCash screen instead of PayMongo (see SimulatedPaymentController).
        if (config('paymongo.simulated')) {
            return response()->json([
                'checkoutUrl' => rtrim(config('app.parishioner_url'), '/').'/payment/simulated?'.http_build_query(['bookingId' => $booking->id]),
                'checkoutSessionId' => 'simulated',
            ]);
        }

        if (! $paymongo->isConfigured()) {
            Log::warning('PayMongo payment requested but PAYMONGO_SECRET_KEY is not set.', ['booking' => $booking->id]);

            return response()->json([
                'message' => 'GCash payments are not available right now. Please try again later.',
            ], 503);
        }

        // QR Ph: our own "Scan to pay" page, which asks for the QR code (see qr()).
        if (config('paymongo.method') === 'qrph') {
            return response()->json([
                'checkoutUrl' => rtrim(config('app.parishioner_url'), '/').'/payment/qr?'.http_build_query(['bookingId' => $booking->id]),
                'checkoutSessionId' => 'qrph',
            ]);
        }

        try {
            $session = $sessions->for($booking);
        } catch (PayMongoException $e) {
            Log::error('PayMongo checkout session creation failed.', ['booking' => $booking->id, 'error' => $e->getMessage()]);

            return response()->json([
                'message' => "We couldn't start your GCash payment. Please try again in a moment.",
            ], 502);
        }

        return response()->json([
            'checkoutUrl' => $session['checkout_url'],
            'checkoutSessionId' => $session['id'],
        ]);
    }

    /** The reasons a booking can't be paid right now, as a response; null when it can. */
    private function notPayable(Booking $booking): ?\Illuminate\Http\JsonResponse
    {
        if ($booking->payment_status === PaymentStatus::Paid) {
            return response()->json(['message' => 'This booking has already been paid.'], 409);
        }

        $holdLapsed = in_array($booking->status, [BookingStatus::Submitted, BookingStatus::Approved], true)
            && $booking->payment_status?->awaitingPayment()
            && $booking->payment_hold_expires_at !== null // no deadline yet means it is still waiting for review
            && ! $booking->payment_hold_expires_at->isFuture();

        if ($holdLapsed) {
            return response()->json([
                'message' => 'The payment window for this booking has closed, so its time is no longer held. Please make a new booking.',
            ], 422);
        }

        if (! $booking->ownerCanPayNow()) {
            $waiting = config('paymongo.approval_before_payment') && $booking->payment_status?->awaitingPayment()
                && in_array($booking->status, [BookingStatus::Submitted, BookingStatus::Returned], true);

            return response()->json(['message' => $waiting
                ? 'The parish office has not approved this booking yet. You can pay once it is approved.'
                : 'This booking has no payment due.'], 422);
        }

        return null;
    }

    /**
     * QR Ph: hands back the booking's QR code, reusing the open one so tapping twice never leaves two codes that could
     * both be paid. The browser polls the booking for `paid`; only PayMongo's signed webhook decides that.
     */
    public function qr(Request $request, string $id, PayMongoClient $paymongo, \App\Services\Booking\CheckoutSessions $sessions)
    {
        $booking = Booking::where('user_id', $request->user()->id)->visibleToOwner()->findOrFail($id);

        if (config('paymongo.method') !== 'qrph') {
            return response()->json(['message' => 'Not found.'], 404);
        }

        if ($blocked = $this->notPayable($booking)) {
            return $blocked;
        }

        if (! $paymongo->isConfigured()) {
            return response()->json(['message' => 'Payments are not available right now. Please try again later.'], 503);
        }

        try {
            $existing = $booking->paymongo_checkout_session_id;
            if ($existing && str_starts_with($existing, 'pi_')) {
                try {
                    $open = $paymongo->retrieveCheckoutSession($existing);
                } catch (PayMongoException) {
                    $open = null;
                }
                if ($open && $open['status'] === 'active' && ! empty($open['qr_image'])) {
                    return response()->json(['qrImage' => $open['qr_image'], 'amountCentavos' => (int) $booking->amount_due_centavos, 'reference' => $booking->reference_number]);
                }
                if ($open && $open['status'] === 'active') {
                    $paymongo->expireCheckoutSession($existing); // an old GCash payment must not stay payable beside the QR
                }
            }

            $sacrament = ucwords(str_replace('-', ' ', $booking->sacrament));
            $owner = trim((string) $booking->ownerName());
            $qr = $paymongo->createQrphPayment([
                'amount_centavos' => (int) $booking->amount_due_centavos,
                'description' => "{$sacrament} booking {$booking->reference_number}".($owner !== '' ? " for {$owner}" : '').' — '.\App\Models\ParishSetting::parishName(),
                'reference_number' => (string) $booking->reference_number,
                'statement_descriptor' => \App\Models\ParishSetting::parishName(),
                'metadata' => ['booking_id' => $booking->id],
                'billing' => array_filter(['name' => $booking->ownerName(), 'email' => $booking->ownerEmail()]),
            ]);
            $booking->update(['paymongo_checkout_session_id' => $qr['id']]);
        } catch (PayMongoException $e) {
            Log::error('PayMongo QR Ph creation failed.', ['booking' => $booking->id, 'error' => $e->getMessage()]);

            return response()->json(['message' => "We couldn't create your QR code. Please try again in a moment."], 502);
        }

        return response()->json(['qrImage' => $qr['qr_image'], 'amountCentavos' => (int) $booking->amount_due_centavos, 'reference' => $booking->reference_number]);
    }

    /**
     * The owner will pay cash at the parish office instead: `pending_cash`, the slot held on the
     * same deadline. The office records the cash later (Admin\BookingController::cashReceived).
     */
    public function chooseCash(Request $request, string $id, BookingStateMachine $bookings)
    {
        $booking = Booking::where('user_id', $request->user()->id)->visibleToOwner()->findOrFail($id);

        return new BookingResource($bookings->chooseCash($booking, $request->user()));
    }
}
