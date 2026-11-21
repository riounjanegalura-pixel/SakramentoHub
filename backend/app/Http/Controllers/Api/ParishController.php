<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ParishSetting;

/** Public parish facts the apps display (emergency banner, cancel dialog, certificates). */
class ParishController extends Controller
{
    public function show()
    {
        [$start, $end] = ParishSetting::workingHours();

        return response()->json([
            'name' => ParishSetting::parishName(),
            'phone' => ParishSetting::parishPhone(),
            // Where to pay cash at the parish office.
            'address' => ParishSetting::parishAddress(),
            'priestName' => ParishSetting::priestName(),
            'workingHours' => ['start' => $start, 'end' => $end],
            // Whether the parishioner app asks for a demo code after a real PayMongo payment (DEMO_PAYMENT_OTP).
            'demoPaymentOtp' => (bool) config('paymongo.demo_otp'),
            // Whether the office approves a booking before the parishioner can pay (APPROVAL_BEFORE_PAYMENT).
            'approvalBeforePayment' => (bool) config('paymongo.approval_before_payment'),
            'lunchBreak' => ['start' => ParishSetting::lunchBreak()[0], 'end' => ParishSetting::lunchBreak()[1]],
        ]);
    }
}
