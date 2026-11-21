<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Donation;
use App\Models\ParishSetting;
use App\Services\PayMongo\PayMongoClient;
use App\Services\PayMongo\PayMongoException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

/**
 * POST /api/donations: opens a payment for a gift of the amount the donor chose. Open to anyone (a donor does
 * not need an account); when a valid token is sent the gift is linked to that account. With PAYMONGO_METHOD=qrph the
 * donor gets a QR Ph code to scan; otherwise a GCash checkout. Like a booking payment, the redirect or scan proves
 * nothing: only the signed webhook marks the donation paid.
 */
class DonationController extends Controller
{
    public function store(Request $request, PayMongoClient $paymongo)
    {
        $data = $request->validate([
            'amountCentavos' => ['required', 'integer', 'min:'.Donation::MIN_CENTAVOS, 'max:'.Donation::MAX_CENTAVOS],
        ], [
            'amountCentavos.min' => 'The smallest gift is ₱'.number_format(Donation::MIN_CENTAVOS / 100).'.',
            'amountCentavos.max' => 'For a gift above ₱'.number_format(Donation::MAX_CENTAVOS / 100).' please see the parish office.',
        ]);

        if (! $paymongo->isConfigured()) {
            Log::warning('PayMongo donation requested but PAYMONGO_SECRET_KEY is not set.');

            return response()->json(['message' => 'GCash giving is not available right now. Please try again later.'], 503);
        }

        $user = $request->user('sanctum');
        $donation = Donation::create(['user_id' => $user?->id, 'amount_centavos' => $data['amountCentavos'], 'status' => 'pending']);
        $base = rtrim(config('app.parishioner_url'), '/');

        // QR Ph, like a booking: our own "Scan to give" page instead of PayMongo's GCash checkout.
        if (config('paymongo.method') === 'qrph') {
            try {
                $qr = $paymongo->createQrphPayment([
                    'amount_centavos' => $donation->amount_centavos,
                    'description' => 'Donation to '.ParishSetting::parishName(),
                    'reference_number' => $donation->reference(),
                    'statement_descriptor' => ParishSetting::parishName(),
                    // Returned inside the signed webhook payload: how the webhook finds the donation.
                    'metadata' => ['donation_id' => $donation->id],
                    'billing' => array_filter(['name' => $user?->full_name, 'email' => $user?->email]),
                ]);
            } catch (PayMongoException $e) {
                Log::error('PayMongo donation QR failed.', ['donation' => $donation->id, 'error' => $e->getMessage()]);
                $donation->delete();

                return response()->json(['message' => "We couldn't create your QR code. Please try again in a moment."], 502);
            }

            $donation->update(['paymongo_checkout_session_id' => $qr['id']]);

            return response()->json([
                'donationId' => $donation->id,
                'qrImage' => $qr['qr_image'],
                'amountCentavos' => $donation->amount_centavos,
                'reference' => $donation->reference(),
            ], 201);
        }

        try {
            $session = $paymongo->createCheckoutSession([
                'amount_centavos' => $donation->amount_centavos,
                'name' => 'Donation',
                'description' => 'Donation to '.ParishSetting::parishName(),
                'reference_number' => $donation->reference(),
                'statement_descriptor' => ParishSetting::parishName(),
                'success_url' => "{$base}/donate/thanks",
                'cancel_url' => "{$base}/donate/cancelled",
                // Returned inside the signed webhook payload: how the webhook finds the donation.
                'metadata' => ['donation_id' => $donation->id],
                'billing' => array_filter(['name' => $user?->full_name, 'email' => $user?->email]),
            ]);
        } catch (PayMongoException $e) {
            Log::error('PayMongo donation checkout failed.', ['donation' => $donation->id, 'error' => $e->getMessage()]);
            $donation->delete();

            return response()->json(['message' => "We couldn't start your GCash payment. Please try again in a moment."], 502);
        }

        $donation->update(['paymongo_checkout_session_id' => $session['id']]);

        return response()->json(['checkoutUrl' => $session['checkout_url']], 201);
    }

    /** Only the status, so the QR page can wait for the signed webhook. The id is a UUID, so it cannot be guessed. */
    public function show(string $id)
    {
        $donation = Donation::findOrFail($id);

        return response()->json(['status' => $donation->status === 'paid' ? 'paid' : 'pending']);
    }
}
