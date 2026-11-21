<?php

use App\Enums\PaymentStatus;
use App\Models\AppNotification;
use App\Models\AuditLog;
use App\Models\Booking;
use App\Models\User;
use App\Services\PayMongo\WebhookSignature;
use Database\Seeders\ServiceSeeder;
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;

const TEST_WEBHOOK_SECRET = 'whsk_test_secret_for_tests';

beforeEach(function () {
    $this->seed(ServiceSeeder::class);
    config([
        'paymongo.mode' => 'test',
        'paymongo.secret_key' => 'sk_test_fake',
        'paymongo.webhook_secret' => TEST_WEBHOOK_SECRET,
        'paymongo.base_url' => 'https://api.paymongo.com/v1',
        'paymongo.auto_approve_on_payment' => false,
        'app.parishioner_url' => 'https://parish.example',
    ]);
    Http::preventStrayRequests();
    Storage::fake('local');
    Carbon::setTestNow(Carbon::parse('2026-11-02 00:00:00', 'UTC'));
});

afterEach(fn () => Carbon::setTestNow());

function pendingBooking(User $owner, array $overrides = []): Booking
{
    return Booking::factory()->create(array_merge([
        'user_id' => $owner->id,
        'sacrament' => 'wedding',
        'status' => 'submitted',
        'payment_status' => PaymentStatus::Unpaid,
        'payment_hold_expires_at' => now()->addHours(48),
        'amount_due_centavos' => 500000,
    ], $overrides));
}

function paidEventPayload(Booking $booking, int $amount, string $type = 'checkout_session.payment.paid', bool $livemode = false): string
{
    return json_encode([
        'data' => [
            'id' => 'evt_'.uniqid(),
            'type' => 'event',
            'attributes' => [
                'type' => $type,
                'livemode' => $livemode,
                'data' => [
                    'id' => 'cs_test_123',
                    'type' => 'checkout_session',
                    'attributes' => [
                        'reference_number' => $booking->reference_number,
                        'metadata' => ['booking_id' => $booking->id],
                        'payments' => [[
                            'id' => 'pay_test_abc',
                            'type' => 'payment',
                            'attributes' => ['amount' => $amount, 'currency' => 'PHP', 'status' => 'paid'],
                        ]],
                    ],
                ],
            ],
        ],
    ]);
}

function postRawWebhook($test, string $body, ?string $signature)
{
    $headers = ['CONTENT_TYPE' => 'application/json', 'HTTP_ACCEPT' => 'application/json'];
    if ($signature !== null) {
        $headers['HTTP_PAYMONGO_SIGNATURE'] = $signature;
    }

    return $test->call('POST', '/api/webhooks/paymongo', [], [], [], $headers, $body);
}

function paidEvent(string $bookingId, string $sessionId, int $amount): array
{
    return [
        'data' => [
            'id' => 'evt_'.uniqid(),
            'type' => 'event',
            'attributes' => [
                'type' => 'checkout_session.payment.paid',
                'livemode' => false,
                'data' => [
                    'id' => $sessionId,
                    'type' => 'checkout_session',
                    'attributes' => [
                        'metadata' => ['booking_id' => $bookingId],
                        'payments' => [[
                            'id' => 'pay_'.uniqid(),
                            'type' => 'payment',
                            'attributes' => ['amount' => $amount, 'currency' => 'PHP', 'status' => 'paid'],
                        ]],
                    ],
                ],
            ],
        ],
    ];
}

function postWebhook(Tests\TestCase $test, array $event)
{
    $body = json_encode($event);

    return postRawWebhook($test, $body, WebhookSignature::sign($body, TEST_WEBHOOK_SECRET));
}

function fakeCheckoutCreated(): void
{
    Http::fake([
        'api.paymongo.com/v1/checkout_sessions' => Http::response([
            'data' => [
                'id' => 'cs_test_123',
                'type' => 'checkout_session',
                'attributes' => ['checkout_url' => 'https://checkout.paymongo.com/cs_test_123', 'status' => 'active'],
            ],
        ]),
    ]);
}

// --- submit: server-side amount snapshot --------------------------------

test('submitting a priced booking snapshots the server-computed fee and marks payment unpaid', function () {
    $user = User::factory()->create();
    $booking = Booking::factory()->create([
        'user_id' => $user->id,
        'sacrament' => 'baptism',
        'status' => 'draft',
        'form_data' => formDataFixture('baptism/valid-basic', $user->id),
        'appointment_date' => '2026-11-15',
        'appointment_start' => '10:00',
    ]);

    $this->actingAs($user)
        ->patchJson("/api/bookings/{$booking->id}/submit")
        ->assertOk()
        ->assertJsonPath('paymentStatus', 'unpaid')
        ->assertJsonPath('amountDueCentavos', 10000);
});

test('submitting a donation-based booking needs no payment', function () {
    $user = User::factory()->create();
    $booking = Booking::factory()->create([
        'user_id' => $user->id,
        'sacrament' => 'funeral',
        'status' => 'draft',
        'form_data' => formDataFixture('funeral/valid-basic', $user->id),
        'appointment_date' => '2026-11-03',
        'appointment_start' => '10:00',
    ]);

    $this->actingAs($user)
        ->patchJson("/api/bookings/{$booking->id}/submit")
        ->assertOk()
        ->assertJsonPath('paymentStatus', 'not_required')
        ->assertJsonPath('amountDueCentavos', 0);
});

// --- initiate ------------------------------------------------------------

test('initiating payment creates a GCash-only PayMongo checkout session for the server-side amount', function () {
    fakeCheckoutCreated();
    $user = User::factory()->create();
    $booking = pendingBooking($user);

    $this->actingAs($user)
        ->postJson("/api/bookings/{$booking->id}/payment")
        ->assertOk()
        ->assertJsonPath('checkoutUrl', 'https://checkout.paymongo.com/cs_test_123')
        ->assertJsonPath('checkoutSessionId', 'cs_test_123');

    expect($booking->fresh()->paymongo_checkout_session_id)->toBe('cs_test_123');

    Http::assertSent(function (HttpRequest $request) use ($booking) {
        $attrs = $request['data']['attributes'];

        return $request->method() === 'POST'
            && $request->hasHeader('Authorization', 'Basic '.base64_encode('sk_test_fake:'))
            && $attrs['line_items'][0]['amount'] === 500000
            && $attrs['line_items'][0]['currency'] === 'PHP'
            && $attrs['payment_method_types'] === ['gcash']
            && $attrs['metadata']['booking_id'] === $booking->id
            && $attrs['reference_number'] === $booking->reference_number
            && $attrs['success_url'] === "https://parish.example/payment/success?bookingId={$booking->id}"
            && $attrs['cancel_url'] === "https://parish.example/payment/cancelled?bookingId={$booking->id}";
    });
});

test('initiating again reuses a still-active checkout session instead of opening a second one', function () {
    Http::fake([
        'api.paymongo.com/v1/checkout_sessions/cs_existing' => Http::response([
            'data' => ['id' => 'cs_existing', 'attributes' => ['checkout_url' => 'https://checkout.paymongo.com/cs_existing', 'status' => 'active']],
        ]),
    ]);
    $user = User::factory()->create();
    $booking = pendingBooking($user, ['paymongo_checkout_session_id' => 'cs_existing']);

    $this->actingAs($user)
        ->postJson("/api/bookings/{$booking->id}/payment")
        ->assertOk()
        ->assertJsonPath('checkoutSessionId', 'cs_existing');

    Http::assertSentCount(1);
});

test('cannot initiate payment for a booking with nothing due', function () {
    $user = User::factory()->create();
    $booking = pendingBooking($user, ['sacrament' => 'funeral', 'payment_status' => PaymentStatus::NotRequired, 'amount_due_centavos' => 0]);

    $this->actingAs($user)->postJson("/api/bookings/{$booking->id}/payment")->assertUnprocessable();
    Http::assertNothingSent();
});

test('cannot initiate payment for an already-paid booking', function () {
    $user = User::factory()->create();
    $booking = pendingBooking($user, ['payment_status' => PaymentStatus::Paid]);

    $this->actingAs($user)->postJson("/api/bookings/{$booking->id}/payment")->assertStatus(409);
});

test('cannot initiate payment for someone else\'s booking', function () {
    $booking = pendingBooking(User::factory()->create());

    $this->actingAs(User::factory()->create())->postJson("/api/bookings/{$booking->id}/payment")->assertNotFound();
});

test('initiating payment without PayMongo credentials fails clearly instead of faking success', function () {
    config(['paymongo.secret_key' => null]);
    $user = User::factory()->create();
    $booking = pendingBooking($user);

    $this->actingAs($user)->postJson("/api/bookings/{$booking->id}/payment")->assertStatus(503);
    Http::assertNothingSent();
});

test('a PayMongo API error surfaces as a 502, not a checkout url', function () {
    Http::fake(['api.paymongo.com/*' => Http::response(['errors' => [['detail' => 'API key is invalid']]], 401)]);
    $user = User::factory()->create();
    $booking = pendingBooking($user);

    $this->actingAs($user)->postJson("/api/bookings/{$booking->id}/payment")
        ->assertStatus(502)
        ->assertJsonMissingPath('checkoutUrl');
});

// --- webhook: happy path ---------------------------------------------------

test('a signed paid webhook marks the booking paid, audits it, and notifies the parishioner', function () {
    $user = User::factory()->create();
    $booking = pendingBooking($user);
    $body = paidEventPayload($booking, 500000);

    postRawWebhook($this, $body, WebhookSignature::sign($body, TEST_WEBHOOK_SECRET))
        ->assertOk()
        ->assertJsonPath('result', 'processed');

    $fresh = $booking->fresh();
    expect($fresh->payment_status)->toBe(PaymentStatus::Paid);
    expect($fresh->paid_at)->not->toBeNull();
    expect($fresh->paymongo_payment_id)->toBe('pay_test_abc');
    // Default: payment is verified automatically, but the booking itself
    // still awaits staff review (documents/date) before it's approved.
    expect($fresh->status->value)->toBe('submitted');

    expect(AuditLog::where('action', 'booking.payment_confirmed')->where('subject_id', $booking->id)->count())->toBe(1);
    expect(AppNotification::where('user_id', $user->id)->where('title', 'Payment Received')->count())->toBe(1);
});

test('with auto-approve enabled, a confirmed payment also advances submitted to approved', function () {
    config(['paymongo.auto_approve_on_payment' => true]);
    $user = User::factory()->create();
    $booking = pendingBooking($user);
    $body = paidEventPayload($booking, 500000);

    postRawWebhook($this, $body, WebhookSignature::sign($body, TEST_WEBHOOK_SECRET))->assertOk();

    expect($booking->fresh()->status->value)->toBe('approved');
    expect($booking->fresh()->payment_status)->toBe(PaymentStatus::Paid);
    expect(AuditLog::where('action', 'booking.approved')->where('subject_id', $booking->id)->exists())->toBeTrue();
});

// --- webhook: security -----------------------------------------------------

test('a webhook with a forged signature is rejected and changes nothing', function () {
    $booking = pendingBooking(User::factory()->create());
    $body = paidEventPayload($booking, 500000);

    postRawWebhook($this, $body, WebhookSignature::sign($body, 'not-the-real-secret'))->assertUnauthorized();

    expect($booking->fresh()->payment_status)->toBe(PaymentStatus::Unpaid);
    expect(AppNotification::count())->toBe(0);
});

test('a webhook with no signature header is rejected', function () {
    $booking = pendingBooking(User::factory()->create());

    postRawWebhook($this, paidEventPayload($booking, 500000), null)->assertUnauthorized();

    expect($booking->fresh()->payment_status)->toBe(PaymentStatus::Unpaid);
});

test('a validly-signed body that was tampered with afterwards is rejected', function () {
    $booking = pendingBooking(User::factory()->create());
    $signature = WebhookSignature::sign(paidEventPayload($booking, 1), TEST_WEBHOOK_SECRET);

    postRawWebhook($this, paidEventPayload($booking, 500000), $signature)->assertUnauthorized();

    expect($booking->fresh()->payment_status)->toBe(PaymentStatus::Unpaid);
});

test('a replayed webhook outside the timestamp tolerance is rejected', function () {
    $booking = pendingBooking(User::factory()->create());
    $body = paidEventPayload($booking, 500000);

    postRawWebhook($this, $body, WebhookSignature::sign($body, TEST_WEBHOOK_SECRET, timestamp: time() - 3600))
        ->assertUnauthorized();

    expect($booking->fresh()->payment_status)->toBe(PaymentStatus::Unpaid);
});

test('in test mode only the test-mode (te) signature is accepted, not a live one', function () {
    $booking = pendingBooking(User::factory()->create());
    $body = paidEventPayload($booking, 500000);

    postRawWebhook($this, $body, WebhookSignature::sign($body, TEST_WEBHOOK_SECRET, live: true))->assertUnauthorized();
});

test('the webhook fails closed when no webhook secret is configured', function () {
    config(['paymongo.webhook_secret' => null]);
    $booking = pendingBooking(User::factory()->create());
    $body = paidEventPayload($booking, 500000);

    postRawWebhook($this, $body, WebhookSignature::sign($body, ''))->assertStatus(503);

    expect($booking->fresh()->payment_status)->toBe(PaymentStatus::Unpaid);
});

// --- webhook: idempotency & edge cases ---------------------------------------

test('a retried/duplicate paid webhook is a no-op the second time', function () {
    $user = User::factory()->create();
    $booking = pendingBooking($user);
    $body = paidEventPayload($booking, 500000);

    postRawWebhook($this, $body, WebhookSignature::sign($body, TEST_WEBHOOK_SECRET))->assertOk()->assertJsonPath('result', 'processed');
    $paidAt = $booking->fresh()->paid_at;

    postRawWebhook($this, $body, WebhookSignature::sign($body, TEST_WEBHOOK_SECRET))->assertOk()->assertJsonPath('result', 'duplicate');

    expect($booking->fresh()->paid_at->equalTo($paidAt))->toBeTrue();
    expect(AppNotification::where('user_id', $user->id)->count())->toBe(1);
    expect(AuditLog::where('action', 'booking.payment_confirmed')->count())->toBe(1);
});

test('a paid webhook for a booking that does not exist is acknowledged without side effects', function () {
    $ghost = pendingBooking(User::factory()->create());
    $body = paidEventPayload($ghost, 500000);
    $ghost->delete();

    postRawWebhook($this, $body, WebhookSignature::sign($body, TEST_WEBHOOK_SECRET))
        ->assertOk()
        ->assertJsonPath('result', 'ignored');

    expect(AppNotification::count())->toBe(0);
    expect(AuditLog::count())->toBe(0);
});

test('a paid webhook whose amount does not cover the amount due is recorded as refund due, never dropped', function () {
    $booking = pendingBooking(User::factory()->create());
    $body = paidEventPayload($booking, 100);

    postRawWebhook($this, $body, WebhookSignature::sign($body, TEST_WEBHOOK_SECRET))->assertOk()->assertJsonPath('result', 'refund_due');

    expect($booking->fresh()->payment_status)->toBe(PaymentStatus::RefundDue);
});

test('unrelated event types are acknowledged and ignored', function () {
    $booking = pendingBooking(User::factory()->create());
    $body = paidEventPayload($booking, 500000, type: 'payment.failed');

    postRawWebhook($this, $body, WebhookSignature::sign($body, TEST_WEBHOOK_SECRET))->assertOk()->assertJsonPath('result', 'ignored');

    expect($booking->fresh()->payment_status)->toBe(PaymentStatus::Unpaid);
});

test('a live-mode event delivered to a test-mode server is ignored', function () {
    $booking = pendingBooking(User::factory()->create());
    $body = paidEventPayload($booking, 500000, livemode: true);

    postRawWebhook($this, $body, WebhookSignature::sign($body, TEST_WEBHOOK_SECRET))->assertOk()->assertJsonPath('result', 'ignored');

    expect($booking->fresh()->payment_status)->toBe(PaymentStatus::Unpaid);
});

// --- admin approval gate -----------------------------------------------------

test('staff cannot approve a booking whose payment is still pending', function () {
    $staff = User::factory()->create(['role' => 'staff']);
    $booking = pendingBooking(User::factory()->create());

    $this->actingAs($staff)->patchJson("/api/admin/bookings/{$booking->id}/approve")->assertUnprocessable();

    expect($booking->fresh()->status->value)->toBe('submitted');
});

test('staff can approve once the webhook has confirmed payment, and the admin view shows it', function () {
    $staff = User::factory()->create(['role' => 'staff']);
    $booking = pendingBooking(User::factory()->create());
    $body = paidEventPayload($booking, 500000);
    postRawWebhook($this, $body, WebhookSignature::sign($body, TEST_WEBHOOK_SECRET))->assertOk();

    $this->actingAs($staff)->getJson("/api/admin/bookings/{$booking->id}")
        ->assertJsonPath('paymentStatus', 'paid')
        ->assertJsonPath('paymentReference', 'pay_test_abc');

    $this->actingAs($staff)->patchJson("/api/admin/bookings/{$booking->id}/approve")
        ->assertOk()
        ->assertJsonPath('status', 'approved');
});

test('staff can still decline a booking for non-payment reasons', function () {
    $staff = User::factory()->create(['role' => 'staff']);
    $booking = pendingBooking(User::factory()->create());

    $this->actingAs($staff)
        ->patchJson("/api/admin/bookings/{$booking->id}/decline", ['reason' => 'Missing baptismal certificate.'])
        ->assertOk()
        ->assertJsonPath('status', 'declined');
});

// --- late payments and payable guard ------------------------------------------

test('a webhook arriving after the 48 hour auto-cancel records a refund due, not a payment', function () {
    $booking = Booking::factory()->scheduled('2027-02-02', '10:00', '11:30')->create([
        'sacrament' => 'wedding', 'status' => 'cancelled', 'payment_status' => 'void',
        'status_reason' => 'Payment not completed within 48 hours.', 'amount_due_centavos' => 500000,
        'paymongo_checkout_session_id' => 'cs_late',
    ]);
    $staff = User::factory()->create(['role' => 'staff']);

    postWebhook($this, paidEvent($booking->id, 'cs_late', 500000))->assertOk()->assertJsonPath('result', 'refund_due');

    expect($booking->fresh()->status->value)->toBe('cancelled')
        ->and($booking->fresh()->payment_status)->toBe(PaymentStatus::RefundDue)
        ->and(AppNotification::where('user_id', $staff->id)->where('title', 'Refund due')->exists())->toBeTrue();
});

test('payment cannot be started for a cancelled booking or an expired hold', function () {
    $user = User::factory()->create();
    $cancelled = Booking::factory()->create(['user_id' => $user->id, 'status' => 'cancelled', 'payment_status' => 'void']);
    $expired = Booking::factory()->create([
        'user_id' => $user->id, 'status' => 'submitted', 'payment_status' => 'unpaid',
        'payment_hold_expires_at' => now()->subMinute(), 'amount_due_centavos' => 500000,
    ]);

    $this->actingAs($user)->postJson("/api/bookings/{$cancelled->id}/payment")->assertUnprocessable();
    $this->actingAs($user)->postJson("/api/bookings/{$expired->id}/payment")->assertUnprocessable()
        ->assertJsonPath('message', 'The payment window for this booking has closed, so its time is no longer held. Please make a new booking.');
});

test('a paid event with no paid payment is ignored and changes nothing', function () {
    $booking = pendingBooking(User::factory()->create());
    $event = paidEvent($booking->id, 'cs_empty', 500000);
    $event['data']['attributes']['data']['attributes']['payments'] = [];

    postWebhook($this, $event)->assertOk()->assertJsonPath('result', 'ignored');

    expect($booking->fresh()->payment_status)->toBe(PaymentStatus::Unpaid)
        ->and(AppNotification::count())->toBe(0);
});
