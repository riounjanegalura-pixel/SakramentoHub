<?php

use App\Models\Donation;
use App\Models\User;
use App\Services\PayMongo\WebhookSignature;
use Illuminate\Support\Facades\Http;

beforeEach(function () {
    config([
        'paymongo.mode' => 'test',
        'paymongo.secret_key' => 'sk_test_fake',
        'paymongo.webhook_secret' => 'whsk_donation_tests',
        'paymongo.base_url' => 'https://api.paymongo.com/v1',
        'app.parishioner_url' => 'https://parish.example',
    ]);
    Http::preventStrayRequests();
});

function fakeDonationCheckout(): void
{
    Http::fake([
        'api.paymongo.com/v1/checkout_sessions' => Http::response([
            'data' => ['id' => 'cs_don_1', 'type' => 'checkout_session', 'attributes' => ['checkout_url' => 'https://checkout.paymongo.com/cs_don_1', 'status' => 'active']],
        ]),
    ]);
}

function donationPaidEvent(string $donationId, int $amount): string
{
    return json_encode(['data' => ['id' => 'evt_'.uniqid(), 'type' => 'event', 'attributes' => [
        'type' => 'checkout_session.payment.paid',
        'livemode' => false,
        'data' => ['id' => 'cs_don_1', 'type' => 'checkout_session', 'attributes' => [
            'metadata' => ['donation_id' => $donationId],
            'payments' => [['id' => 'pay_don_1', 'type' => 'payment', 'attributes' => ['amount' => $amount, 'currency' => 'PHP', 'status' => 'paid']]],
        ]],
    ]]]);
}

test('anyone can start a GCash-only donation of the amount they chose, with no account', function () {
    fakeDonationCheckout();

    $this->postJson('/api/donations', ['amountCentavos' => 50000])
        ->assertCreated()
        ->assertJsonPath('checkoutUrl', 'https://checkout.paymongo.com/cs_don_1');

    $donation = Donation::first();
    expect($donation->amount_centavos)->toBe(50000)
        ->and($donation->status)->toBe('pending')
        ->and($donation->user_id)->toBeNull()
        ->and($donation->paymongo_checkout_session_id)->toBe('cs_don_1');

    Http::assertSent(function ($request) use ($donation) {
        $a = $request['data']['attributes'];

        return $a['payment_method_types'] === ['gcash']
            && $a['line_items'][0]['amount'] === 50000
            && $a['metadata'] === ['donation_id' => $donation->id]
            && $a['success_url'] === 'https://parish.example/donate/thanks';
    });
});

test('a signed-in donor is linked to the gift', function () {
    fakeDonationCheckout();
    $user = User::factory()->create();

    $this->actingAs($user, 'sanctum')->postJson('/api/donations', ['amountCentavos' => 10000])->assertCreated();

    expect(Donation::first()->user_id)->toBe($user->id);
});

test('the amount has to be between the minimum and the maximum', function () {
    $this->postJson('/api/donations', ['amountCentavos' => 1999])->assertStatus(422)->assertJsonValidationErrors('amountCentavos');
    $this->postJson('/api/donations', ['amountCentavos' => 10_000_001])->assertStatus(422);
    $this->postJson('/api/donations', [])->assertStatus(422);
    $this->postJson('/api/donations', ['amountCentavos' => 'lots'])->assertStatus(422);
    expect(Donation::count())->toBe(0);
});

test('without a PayMongo key it says so and keeps nothing', function () {
    config(['paymongo.secret_key' => null]);

    $this->postJson('/api/donations', ['amountCentavos' => 10000])->assertStatus(503);

    expect(Donation::count())->toBe(0);
});

test('a PayMongo failure is reported and leaves no half-made donation', function () {
    Http::fake(['api.paymongo.com/v1/checkout_sessions' => Http::response(['errors' => [['detail' => 'nope']]], 500)]);

    $this->postJson('/api/donations', ['amountCentavos' => 10000])->assertStatus(502);

    expect(Donation::count())->toBe(0);
});

test('only the signed webhook marks a donation paid, once', function () {
    $donation = Donation::create(['amount_centavos' => 50000, 'status' => 'pending']);
    $body = donationPaidEvent($donation->id, 50000);
    $headers = ['CONTENT_TYPE' => 'application/json', 'HTTP_ACCEPT' => 'application/json'];

    // The browser coming back from PayMongo proves nothing.
    expect($donation->fresh()->status)->toBe('pending');

    // A forged call is refused.
    $this->call('POST', '/api/webhooks/paymongo', [], [], [], $headers + ['HTTP_PAYMONGO_SIGNATURE' => WebhookSignature::sign($body, 'wrong')], $body)->assertUnauthorized();
    expect($donation->fresh()->status)->toBe('pending');

    $signed = $headers + ['HTTP_PAYMONGO_SIGNATURE' => WebhookSignature::sign($body, 'whsk_donation_tests')];
    $this->call('POST', '/api/webhooks/paymongo', [], [], [], $signed, $body)->assertOk()->assertJsonPath('result', 'processed');

    $paid = $donation->fresh();
    expect($paid->status)->toBe('paid')->and($paid->paymongo_payment_id)->toBe('pay_don_1')->and($paid->paid_at)->not->toBeNull();

    $this->call('POST', '/api/webhooks/paymongo', [], [], [], $signed, $body)->assertOk()->assertJsonPath('result', 'duplicate');
});
