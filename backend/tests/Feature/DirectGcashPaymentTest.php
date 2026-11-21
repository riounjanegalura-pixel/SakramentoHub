<?php

use App\Enums\PaymentStatus;
use App\Models\Booking;
use App\Models\Donation;
use App\Models\User;
use App\Services\PayMongo\PayMongoClient;
use App\Services\PayMongo\WebhookSignature;
use Database\Seeders\ServiceSeeder;
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;

// The direct flow: the payer goes straight to GCash (a payment intent), with no PayMongo checkout page.

const DIRECT_WEBHOOK_SECRET = 'whsk_direct_secret_for_tests';
const GCASH_URL = 'https://secure-authentication.paymongo.com/sources?id=src_abc';

beforeEach(function () {
    $this->seed(ServiceSeeder::class);
    config([
        'paymongo.flow' => 'direct',
        'paymongo.mode' => 'test',
        'paymongo.secret_key' => 'sk_test_fake',
        'paymongo.webhook_secret' => DIRECT_WEBHOOK_SECRET,
        'paymongo.base_url' => 'https://api.paymongo.com/v1',
        'paymongo.auto_approve_on_payment' => false,
        'app.parishioner_url' => 'https://parish.example',
    ]);
    Http::preventStrayRequests();
    Storage::fake('local');
    Carbon::setTestNow(Carbon::parse('2026-11-02 00:00:00', 'UTC'));
});

afterEach(fn () => Carbon::setTestNow());

function directBooking(User $owner, array $overrides = []): Booking
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

function fakeDirectGcash(): void
{
    Http::fake([
        'api.paymongo.com/v1/payment_intents' => Http::response(['data' => ['id' => 'pi_test_1', 'attributes' => ['client_key' => 'pi_test_1_client_x', 'status' => 'awaiting_payment_method']]]),
        'api.paymongo.com/v1/payment_methods' => Http::response(['data' => ['id' => 'pm_test_1']]),
        'api.paymongo.com/v1/payment_intents/pi_test_1/attach' => Http::response(['data' => ['id' => 'pi_test_1', 'attributes' => [
            'status' => 'awaiting_next_action',
            'next_action' => ['type' => 'redirect', 'redirect' => ['url' => GCASH_URL, 'return_url' => 'https://parish.example/payment/success']],
        ]]]),
    ]);
}

function directPaidEvent(string $intentId, int $amount, array $metadata = []): array
{
    return ['data' => [
        'id' => 'evt_'.uniqid(),
        'type' => 'event',
        'attributes' => [
            'type' => 'payment.paid',
            'livemode' => false,
            'data' => [
                'id' => 'pay_'.uniqid(),
                'type' => 'payment',
                'attributes' => ['amount' => $amount, 'currency' => 'PHP', 'status' => 'paid', 'payment_intent_id' => $intentId, 'metadata' => $metadata],
            ],
        ],
    ]];
}

function postDirectWebhook($test, array $event)
{
    $body = json_encode($event);

    return $test->call('POST', '/api/webhooks/paymongo', [], [], [], [
        'CONTENT_TYPE' => 'application/json',
        'HTTP_ACCEPT' => 'application/json',
        'HTTP_PAYMONGO_SIGNATURE' => WebhookSignature::sign($body, DIRECT_WEBHOOK_SECRET),
    ], $body);
}

test('paying opens GCash directly: a GCash-only payment for the server-side amount, no checkout page', function () {
    fakeDirectGcash();
    $user = User::factory()->create();
    $booking = directBooking($user);

    $this->actingAs($user)
        ->postJson("/api/bookings/{$booking->id}/payment")
        ->assertOk()
        ->assertJsonPath('checkoutUrl', GCASH_URL)
        ->assertJsonPath('checkoutSessionId', 'pi_test_1');

    expect($booking->fresh()->paymongo_checkout_session_id)->toBe('pi_test_1');

    Http::assertSent(fn (HttpRequest $r) => str_ends_with($r->url(), '/payment_intents')
        && $r['data']['attributes']['amount'] === 500000
        && $r['data']['attributes']['currency'] === 'PHP'
        && $r['data']['attributes']['payment_method_allowed'] === ['gcash']
        && $r['data']['attributes']['metadata']['booking_id'] === $booking->id);
    Http::assertSent(fn (HttpRequest $r) => str_ends_with($r->url(), '/payment_methods') && $r['data']['attributes']['type'] === 'gcash');
    Http::assertSent(fn (HttpRequest $r) => str_ends_with($r->url(), '/payment_intents/pi_test_1/attach')
        && $r['data']['attributes']['payment_method'] === 'pm_test_1'
        && $r['data']['attributes']['client_key'] === 'pi_test_1_client_x'
        && $r['data']['attributes']['return_url'] === "https://parish.example/payment/success?bookingId={$booking->id}");
    Http::assertNotSent(fn (HttpRequest $r) => str_contains($r->url(), 'checkout_sessions'));
});

test('paying again reuses a payment that is still waiting at GCash', function () {
    Http::fake(['api.paymongo.com/v1/payment_intents/pi_waiting' => Http::response(['data' => ['id' => 'pi_waiting', 'attributes' => [
        'status' => 'awaiting_next_action',
        'next_action' => ['type' => 'redirect', 'redirect' => ['url' => GCASH_URL]],
    ]]])]);
    $user = User::factory()->create();
    $booking = directBooking($user, ['paymongo_checkout_session_id' => 'pi_waiting']);

    $this->actingAs($user)
        ->postJson("/api/bookings/{$booking->id}/payment")
        ->assertOk()
        ->assertJsonPath('checkoutSessionId', 'pi_waiting')
        ->assertJsonPath('checkoutUrl', GCASH_URL);

    Http::assertSentCount(1);
});

test('a payment that failed at GCash is replaced by a fresh one', function () {
    fakeDirectGcash();
    Http::fake(['api.paymongo.com/v1/payment_intents/pi_failed' => Http::response(['data' => ['id' => 'pi_failed', 'attributes' => ['status' => 'awaiting_payment_method']]])]);
    $user = User::factory()->create();
    $booking = directBooking($user, ['paymongo_checkout_session_id' => 'pi_failed']);

    $this->actingAs($user)
        ->postJson("/api/bookings/{$booking->id}/payment")
        ->assertOk()
        ->assertJsonPath('checkoutSessionId', 'pi_test_1');
});

test('a payment.paid event marks the booking paid, found by the payment intent we stored', function () {
    $user = User::factory()->create();
    $booking = directBooking($user, ['paymongo_checkout_session_id' => 'pi_test_1']);

    postDirectWebhook($this, directPaidEvent('pi_test_1', 500000))
        ->assertOk()
        ->assertJsonPath('result', 'processed');

    expect($booking->fresh()->payment_status)->toBe(PaymentStatus::Paid);
});

test('a payment.paid event for the same payment twice is recorded once', function () {
    $user = User::factory()->create();
    $booking = directBooking($user, ['paymongo_checkout_session_id' => 'pi_test_1']);
    $event = directPaidEvent('pi_test_1', 500000);

    postDirectWebhook($this, $event)->assertJsonPath('result', 'processed');
    postDirectWebhook($this, $event)->assertJsonPath('result', 'duplicate');
});

test('a payment.paid event for an unknown payment intent is acknowledged and ignored', function () {
    postDirectWebhook($this, directPaidEvent('pi_nobody', 500000))
        ->assertOk()
        ->assertJsonPath('result', 'ignored');
});

test('a payment.paid event marks a donation paid, found by its payment intent', function () {
    $donation = Donation::create(['amount_centavos' => 50000, 'status' => 'pending', 'paymongo_checkout_session_id' => 'pi_gift_1']);

    postDirectWebhook($this, directPaidEvent('pi_gift_1', 50000))
        ->assertOk()
        ->assertJsonPath('result', 'processed');

    expect($donation->fresh()->status)->toBe('paid');
});

test('expiring a direct payment cancels the payment intent', function () {
    Http::fake(['api.paymongo.com/v1/payment_intents/pi_test_1/cancel' => Http::response(['data' => ['id' => 'pi_test_1']])]);

    app(PayMongoClient::class)->expireCheckoutSession('pi_test_1');

    Http::assertSent(fn (HttpRequest $r) => $r->method() === 'POST' && str_ends_with($r->url(), '/payment_intents/pi_test_1/cancel'));
});

test('a session started before the switch can still be looked up and expired', function () {
    Http::fake(['api.paymongo.com/v1/checkout_sessions/cs_old' => Http::response(['data' => ['id' => 'cs_old', 'attributes' => ['checkout_url' => 'https://checkout.paymongo.com/cs_old', 'status' => 'active']]])]);

    $session = app(PayMongoClient::class)->retrieveCheckoutSession('cs_old');

    expect($session['status'])->toBe('active');
});
