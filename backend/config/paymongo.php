<?php

/*
|--------------------------------------------------------------------------
| PayMongo (GCash) payment gateway
|--------------------------------------------------------------------------
|
| The client's feedback calls this "MongoPay"; the actual Philippine GCash
| gateway with this API is PayMongo (https://docs.paymongo.com). Bookings
| with a fee are paid through a PayMongo Checkout Session restricted to
| GCash, and confirmed ONLY by a signed `checkout_session.payment.paid`
| webhook — never by the browser's return redirect.
|
| Test vs live is not a different host at PayMongo: it is decided by which
| key pair you use (sk_test_... vs sk_live_...). `mode` must match the keys,
| because it selects which signature (`te` = test, `li` = live) in the
| Paymongo-Signature header is checked, and webhook events whose `livemode`
| flag disagrees with it are ignored.
|
| Until real credentials are set, initiating a payment returns 503 and the
| webhook rejects everything — nothing here can move real money.
|
*/

return [
    'mode' => env('PAYMONGO_MODE', 'test') === 'live' ? 'live' : 'test',

    // 'direct' sends the payer straight to GCash (a Payment Intent); 'checkout' uses PayMongo's hosted
    // checkout page instead. Switch back with PAYMONGO_FLOW=checkout if the direct flow misbehaves.
    'flow' => env('PAYMONGO_FLOW', 'direct') === 'checkout' ? 'checkout' : 'direct',

    // true: the parish office approves a booking FIRST, and only then can the parishioner pay (the slot is held while it is
    // reviewed; the payment window opens on approval). false: the older order, pay while the booking waits for review, and
    // the office approves once it is paid. Walk-ins entered at the desk keep the older order either way.
    'approval_before_payment' => (bool) env('APPROVAL_BEFORE_PAYMENT', true),

    // TESTING SWITCH. true: every service that has a fee costs ₱1.00 (free services stay free), so real payments can be tried
    // for a peso. false: the real prices from the services table. Flip this one value (or set ONE_PESO_TEST_PRICES on the
    // server) before a demo that should show the real fees.
    'one_peso_test_prices' => (bool) env('ONE_PESO_TEST_PRICES', true),

    // Which method "Pay" offers a parishioner. 'gcash' (default) is the GCash redirect above. 'qrph' shows a QR Ph code on our
    // own "Scan to pay" page instead, payable from GCash, Maya or any bank app, and confirmed by the same signed webhook.
    'method' => env('PAYMONGO_METHOD', 'gcash') === 'qrph' ? 'qrph' : 'gcash',

    // How long a QR Ph code stays scannable, in seconds (PayMongo accepts 60 to 9000).
    'qrph_expiry_seconds' => (int) env('PAYMONGO_QRPH_EXPIRY', 1800),

    // DEMO ONLY. When PAYMENT_MODE=simulated, "Pay with GCash" opens our own mock GCash screen (mobile number, a real
    // one-time code we send, confirm) and a correct code records the payment WITHOUT PayMongo and with no money moving.
    // Off by default; the endpoints answer 404 while it is off. Never enable it on a system taking real payments.
    'simulated' => env('PAYMENT_MODE') === 'simulated',

    // DEMO ONLY. A real PayMongo payment as usual, then our own screen asks the payer to verify their mobile number with
    // a real one-time code (SMS). The code does not decide whether the booking is paid: PayMongo's webhook does that.
    'demo_otp' => (bool) env('DEMO_PAYMENT_OTP', false),

    'secret_key' => env('PAYMONGO_SECRET_KEY'),

    'webhook_secret' => env('PAYMONGO_WEBHOOK_SECRET'),

    'base_url' => env('PAYMONGO_BASE_URL', 'https://api.paymongo.com/v1'),

    // Reject webhook deliveries whose signed timestamp is older/newer than
    // this many seconds — blunts replay of a captured (validly signed) request.
    'webhook_tolerance_seconds' => (int) env('PAYMONGO_WEBHOOK_TOLERANCE', 300),

    // Off by default: a confirmed payment marks the booking paid but leaves it
    // `submitted` for staff to review documents/date before approving. Set to
    // true to have a confirmed payment approve the booking automatically.
    'auto_approve_on_payment' => (bool) env('PAYMONGO_AUTO_APPROVE_ON_PAYMENT', false),
];
