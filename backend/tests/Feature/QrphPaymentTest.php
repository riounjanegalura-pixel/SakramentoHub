<?php

use App\Enums\PaymentStatus;
use App\Models\Booking;
use App\Models\User;
use Database\Seeders\ServiceSeeder;
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;

// QR Ph: "Pay" opens our own Scan-to-pay page; the QR code comes from a payment intent with a `qrph` method.

const QR_IMAGE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';

beforeEach(function () {
    $this->seed(ServiceSeeder::class);
    config([
        'paymongo.method' => 'qrph',
        'paymongo.simulated' => false,
        'paymongo.secret_key' => 'sk_test_fake',
        'paymongo.base_url' => 'https://api.paymongo.com/v1',
        'app.parishioner_url' => 'https://parish.example',
    ]);
    Http::preventStrayRequests();
    Carbon::setTestNow(Carbon::parse('2026-11-02 00:00:00', 'UTC'));
});

afterEach(fn () => Carbon::setTestNow());

function qrBooking(User $owner, array $overrides = []): Booking
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

function fakeQrph(): void
{
    Http::fake([
        'api.paymongo.com/v1/payment_intents' => Http::response(['data' => ['id' => 'pi_qr_1', 'attributes' => ['client_key' => 'pi_qr_1_client', 'status' => 'awaiting_payment_method']]]),
        'api.paymongo.com/v1/payment_methods' => Http::response(['data' => ['id' => 'pm_qr_1']]),
        'api.paymongo.com/v1/payment_intents/pi_qr_1/attach' => Http::response(['data' => ['id' => 'pi_qr_1', 'attributes' => [
            'status' => 'awaiting_next_action',
            'next_action' => ['type' => 'consume_qr', 'code' => ['id' => 'code_1', 'amount' => 500000, 'image_url' => QR_IMAGE]],
        ]]]),
    ]);
}

test('Pay sends the parishioner to our Scan-to-pay page, without calling PayMongo yet', function () {
    $user = User::factory()->create();
    $booking = qrBooking($user);

    $this->actingAs($user)
        ->postJson("/api/bookings/{$booking->id}/payment")
        ->assertOk()
        ->assertJsonPath('checkoutSessionId', 'qrph')
        ->assertJsonPath('checkoutUrl', "https://parish.example/payment/qr?bookingId={$booking->id}");

    Http::assertNothingSent();
});

test('the QR page gets a QR Ph code for the server-side amount, and the intent is remembered on the booking', function () {
    fakeQrph();
    $user = User::factory()->create();
    $booking = qrBooking($user);

    $this->actingAs($user)
        ->postJson("/api/bookings/{$booking->id}/payment/qr")
        ->assertOk()
        ->assertJsonPath('qrImage', QR_IMAGE)
        ->assertJsonPath('amountCentavos', 500000);

    expect($booking->fresh()->paymongo_checkout_session_id)->toBe('pi_qr_1');

    Http::assertSent(fn (HttpRequest $r) => str_ends_with($r->url(), '/payment_intents')
        && $r['data']['attributes']['amount'] === 500000
        && $r['data']['attributes']['payment_method_allowed'] === ['qrph']
        && $r['data']['attributes']['metadata']['booking_id'] === $booking->id);
    Http::assertSent(fn (HttpRequest $r) => str_ends_with($r->url(), '/payment_methods') && $r['data']['attributes']['type'] === 'qrph');
});

test('asking again reuses the open QR instead of making a second code', function () {
    Http::fake(['api.paymongo.com/v1/payment_intents/pi_qr_open' => Http::response(['data' => ['id' => 'pi_qr_open', 'attributes' => [
        'status' => 'awaiting_next_action',
        'next_action' => ['type' => 'consume_qr', 'code' => ['image_url' => QR_IMAGE]],
    ]]])]);
    $user = User::factory()->create();
    $booking = qrBooking($user, ['paymongo_checkout_session_id' => 'pi_qr_open']);

    $this->actingAs($user)
        ->postJson("/api/bookings/{$booking->id}/payment/qr")
        ->assertOk()
        ->assertJsonPath('qrImage', QR_IMAGE);

    Http::assertSentCount(1);
});

test('a paid booking gets no QR', function () {
    $user = User::factory()->create();
    $booking = qrBooking($user, ['payment_status' => PaymentStatus::Paid]);

    $this->actingAs($user)->postJson("/api/bookings/{$booking->id}/payment/qr")->assertStatus(409);
    Http::assertNothingSent();
});

test("someone else's booking is not found", function () {
    $booking = qrBooking(User::factory()->create());

    $this->actingAs(User::factory()->create())->postJson("/api/bookings/{$booking->id}/payment/qr")->assertNotFound();
});

test('the QR endpoint answers 404 unless QR Ph is switched on', function () {
    config(['paymongo.method' => 'gcash']);
    $user = User::factory()->create();
    $booking = qrBooking($user);

    $this->actingAs($user)->postJson("/api/bookings/{$booking->id}/payment/qr")->assertNotFound();
});

test('the one-peso testing switch makes a fee-bearing booking cost ₱1 and leaves free ones free', function () {
    $user = User::factory()->create();
    $paid = qrBooking($user);

    config(['paymongo.one_peso_test_prices' => false]);
    expect($paid->computeAmountDue())->toBeGreaterThan(100);

    config(['paymongo.one_peso_test_prices' => true]);
    expect($paid->computeAmountDue())->toBe(100);
});
