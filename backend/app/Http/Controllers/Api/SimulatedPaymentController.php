<?php

namespace App\Http\Controllers\Api;

use App\Enums\BookingStatus;
use App\Enums\PaymentStatus;
use App\Http\Controllers\Controller;
use App\Http\Resources\BookingResource;
use App\Models\Booking;
use App\Services\Booking\BookingStateMachine;
use App\Services\Payment\OneTimeCode;
use App\Services\Payment\OneTimeCodeException;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/**
 * DEMO ONLY (PAYMENT_MODE=simulated): the mock GCash screen's two calls. `send` texts (or emails) a real one-time code;
 * `confirm` checks it and records the payment through the same BookingStateMachine::recordPayment() the PayMongo
 * webhook uses. No money moves. Every call answers 404 unless the flag is on, so a live system cannot be paid for free.
 *
 * With DEMO_PAYMENT_OTP instead, the same two calls only verify a mobile number after a REAL PayMongo payment: the code
 * is checked, nothing is recorded, and the booking's paid state still comes only from PayMongo's webhook.
 */
class SimulatedPaymentController extends Controller
{
    public const PAYMENT_PREFIX = 'pay_sim_';

    public function send(Request $request, string $id, OneTimeCode $codes)
    {
        $booking = $this->payable($request, $id);
        $data = $request->validate(['mobile' => ['required', 'regex:/^09\d{9}$/']], [
            'mobile.regex' => 'Enter an 11-digit mobile number that starts with 09.',
        ]);

        try {
            $sent = $codes->send($booking->id, $request->user(), $data['mobile']);
        } catch (OneTimeCodeException $e) {
            return response()->json(['message' => $e->getMessage()], 502);
        }
        if ($sent === null) {
            return response()->json(['message' => 'A code was just sent. Please wait a moment before asking for another.'], 429);
        }

        return response()->json($sent + ['expiresInSeconds' => OneTimeCode::TTL_SECONDS]);
    }

    public function confirm(Request $request, string $id, OneTimeCode $codes, BookingStateMachine $bookings)
    {
        $booking = $this->payable($request, $id);
        $data = $request->validate(['code' => ['required', 'digits:6']], ['code.digits' => 'Enter the 6-digit code.']);

        $result = $codes->check($booking->id, $data['code']);
        if ($result !== 'ok') {
            return response()->json(['message' => match ($result) {
                'wrong' => 'That code is not right. Check it and try again.',
                'locked' => 'Too many wrong tries. Ask for a new code.',
                default => 'That code has expired. Ask for a new code.',
            }], 422);
        }

        if ($this->verifyOnly()) {
            return new BookingResource($booking);
        }

        $bookings->recordPayment($booking, null, self::PAYMENT_PREFIX.Str::lower(Str::random(16)), (int) $booking->amount_due_centavos, 'evt_sim_'.Str::uuid());

        return new BookingResource($booking->fresh());
    }

    /** The after-payment demo code: on, and not the mock-GCash mode. */
    private function verifyOnly(): bool
    {
        return config('paymongo.demo_otp') && ! config('paymongo.simulated');
    }

    private function payable(Request $request, string $id): Booking
    {
        abort_unless(config('paymongo.simulated') || $this->verifyOnly(), 404);

        $booking = Booking::where('user_id', $request->user()->id)->visibleToOwner()->findOrFail($id);
        if ($this->verifyOnly()) {
            return $booking; // the payment already happened at PayMongo; this only verifies a number
        }
        abort_if($booking->payment_status === PaymentStatus::Paid, 409, 'This booking has already been paid.');

        abort_unless($booking->ownerCanPayNow(), 422, 'This booking has no payment due.');

        return $booking;
    }
}
