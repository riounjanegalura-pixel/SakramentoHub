<?php

use App\Enums\PaymentStatus;
use App\Models\Booking;
use App\Models\User;
use Database\Seeders\ServiceSeeder;
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;

// The demo's mock GCash screen: a real one-time code is sent, a correct one records the payment, no money moves.

beforeEach(function () {
    $this->seed(ServiceSeeder::class);
    config([
        'paymongo.simulated' => true,
        'paymongo.secret_key' => null,
        'services.textbee.api_key' => null,
        'services.textbee.device_id' => null,
        'app.parishioner_url' => 'https://parish.example',
    ]);
    Cache::flush();
    Http::preventStrayRequests();
    Storage::fake('local');
    Carbon::setTestNow(Carbon::parse('2026-11-02 00:00:00', 'UTC'));
});

afterEach(fn () => Carbon::setTestNow());

function simBooking(User $owner, array $overrides = []): Booking
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

/** Sends a code by email and returns the six digits from the message. */
function sentEmailCode($test, Booking $booking, User $user): string
{
    $code = null;
    Mail::shouldReceive('raw')->once()->andReturnUsing(function ($text) use (&$code) {
        preg_match('/code is (\d{6})/', $text, $m);
        $code = $m[1];
    });
    $test->actingAs($user)->postJson("/api/bookings/{$booking->id}/payment/simulated/code", ['mobile' => '09171234567'])->assertOk();

    return $code;
}

test('paying in demo mode points at the mock GCash screen, not PayMongo', function () {
    $user = User::factory()->create();
    $booking = simBooking($user);

    $this->actingAs($user)
        ->postJson("/api/bookings/{$booking->id}/payment")
        ->assertOk()
        ->assertJsonPath('checkoutUrl', "https://parish.example/payment/simulated?bookingId={$booking->id}");
    Http::assertNothingSent();
});

test('with the flag off, the mock endpoints do not exist', function () {
    config(['paymongo.simulated' => false]);
    $user = User::factory()->create();
    $booking = simBooking($user);

    $this->actingAs($user)->postJson("/api/bookings/{$booking->id}/payment/simulated/code", ['mobile' => '09171234567'])->assertNotFound();
    $this->actingAs($user)->postJson("/api/bookings/{$booking->id}/payment/simulated/confirm", ['code' => '123456'])->assertNotFound();
    expect($booking->fresh()->payment_status)->toBe(PaymentStatus::Unpaid);
});

test('the code is texted to the mobile number through TextBee when it is set up', function () {
    config(['services.textbee.api_key' => 'tb_key', 'services.textbee.device_id' => 'dev_1', 'services.textbee.base_url' => 'https://api.textbee.dev/api/v1']);
    Http::fake(['api.textbee.dev/*' => Http::response(['data' => ['success' => true]], 200)]);
    $user = User::factory()->create();
    $booking = simBooking($user);

    $this->actingAs($user)
        ->postJson("/api/bookings/{$booking->id}/payment/simulated/code", ['mobile' => '09171234567'])
        ->assertOk()
        ->assertJsonPath('channel', 'sms')
        ->assertJsonPath('to', '0917***567');

    Http::assertSent(fn (HttpRequest $r) => $r->url() === 'https://api.textbee.dev/api/v1/gateway/devices/dev_1/send-sms'
        && $r->hasHeader('x-api-key', 'tb_key')
        && $r['recipients'] === ['+639171234567']
        && preg_match('/code is \d{6}/', $r['message']) === 1);
});

test('when the TextBee phone is offline or refuses it, the code is emailed instead, without revealing why', function () {
    config(['services.textbee.api_key' => 'tb_key', 'services.textbee.device_id' => 'dev_1', 'services.textbee.base_url' => 'https://api.textbee.dev/api/v1']);
    Http::fake(['api.textbee.dev/*' => Http::response(['message' => 'device offline'], 500)]);
    $user = User::factory()->create();
    $booking = simBooking($user);
    $code = null;
    Mail::shouldReceive('raw')->once()->andReturnUsing(function ($text) use (&$code) {
        preg_match('/code is (\d{6})/', $text, $m);
        $code = $m[1];
    });

    $this->actingAs($user)
        ->postJson("/api/bookings/{$booking->id}/payment/simulated/code", ['mobile' => '09171234567'])
        ->assertOk()
        ->assertJsonPath('channel', 'email')
        ->assertJsonMissingPath('message');

    $this->actingAs($user)->postJson("/api/bookings/{$booking->id}/payment/simulated/confirm", ['code' => $code])->assertOk();
});

test('without an SMS gateway the code goes to the account email', function () {
    $user = User::factory()->create();
    $booking = simBooking($user);

    sentEmailCode($this, $booking, $user);
});

test('a wrong code is refused and the booking stays unpaid', function () {
    $user = User::factory()->create();
    $booking = simBooking($user);
    $code = sentEmailCode($this, $booking, $user);
    $wrong = $code === '000000' ? '111111' : '000000';

    $this->actingAs($user)->postJson("/api/bookings/{$booking->id}/payment/simulated/confirm", ['code' => $wrong])->assertStatus(422);
    expect($booking->fresh()->payment_status)->toBe(PaymentStatus::Unpaid);
});

test('the right code records the payment, once', function () {
    $user = User::factory()->create();
    $booking = simBooking($user);
    $code = sentEmailCode($this, $booking, $user);

    $this->actingAs($user)->postJson("/api/bookings/{$booking->id}/payment/simulated/confirm", ['code' => $code])
        ->assertOk()
        ->assertJsonPath('paymentStatus', 'paid');

    $fresh = $booking->fresh();
    expect($fresh->payment_status)->toBe(PaymentStatus::Paid)
        ->and($fresh->paymongo_payment_id)->toStartWith('pay_sim_')
        ->and($fresh->amount_paid_centavos)->toBe(500000);

    $this->actingAs($user)->postJson("/api/bookings/{$booking->id}/payment/simulated/confirm", ['code' => $code])->assertStatus(409);
});

test('five wrong tries lock the code, even the right one', function () {
    $user = User::factory()->create();
    $booking = simBooking($user);
    $code = sentEmailCode($this, $booking, $user);
    $wrong = $code === '000000' ? '111111' : '000000';

    foreach (range(1, 5) as $_) {
        $this->actingAs($user)->postJson("/api/bookings/{$booking->id}/payment/simulated/confirm", ['code' => $wrong])->assertStatus(422);
    }
    $this->actingAs($user)->postJson("/api/bookings/{$booking->id}/payment/simulated/confirm", ['code' => $code])->assertStatus(422);
    expect($booking->fresh()->payment_status)->toBe(PaymentStatus::Unpaid);
});

test('a code expires after five minutes', function () {
    $user = User::factory()->create();
    $booking = simBooking($user);
    $code = sentEmailCode($this, $booking, $user);

    Carbon::setTestNow(now()->addMinutes(6));

    $this->actingAs($user)->postJson("/api/bookings/{$booking->id}/payment/simulated/confirm", ['code' => $code])->assertStatus(422);
});

test('a second code cannot be requested straight away', function () {
    $user = User::factory()->create();
    $booking = simBooking($user);
    sentEmailCode($this, $booking, $user);

    $this->actingAs($user)->postJson("/api/bookings/{$booking->id}/payment/simulated/code", ['mobile' => '09171234567'])->assertStatus(429);
});

test('a mobile number that is not 09 and 11 digits is refused', function () {
    $user = User::factory()->create();
    $booking = simBooking($user);

    $this->actingAs($user)->postJson("/api/bookings/{$booking->id}/payment/simulated/code", ['mobile' => '12345'])->assertUnprocessable();
});

test('only the booking owner can use the mock screen for it', function () {
    $booking = simBooking(User::factory()->create());

    $this->actingAs(User::factory()->create())
        ->postJson("/api/bookings/{$booking->id}/payment/simulated/code", ['mobile' => '09171234567'])
        ->assertNotFound();
});

// DEMO_PAYMENT_OTP: a real PayMongo payment first, then a code only verifies the mobile number.

test('after a real payment, a correct code verifies the number and changes nothing about the payment', function () {
    config(['paymongo.simulated' => false, 'paymongo.demo_otp' => true]);
    $user = User::factory()->create();
    $booking = simBooking($user, ['payment_status' => PaymentStatus::Paid, 'amount_paid_centavos' => 500000, 'paymongo_payment_id' => 'pay_real_1']);
    $code = sentEmailCode($this, $booking, $user);

    $this->actingAs($user)->postJson("/api/bookings/{$booking->id}/payment/simulated/confirm", ['code' => $code])->assertOk();

    expect($booking->fresh()->paymongo_payment_id)->toBe('pay_real_1');
});

test('the verify-only code never marks an unpaid booking paid', function () {
    config(['paymongo.simulated' => false, 'paymongo.demo_otp' => true]);
    $user = User::factory()->create();
    $booking = simBooking($user);
    $code = sentEmailCode($this, $booking, $user);

    $this->actingAs($user)->postJson("/api/bookings/{$booking->id}/payment/simulated/confirm", ['code' => $code])->assertOk();

    expect($booking->fresh()->payment_status)->toBe(PaymentStatus::Unpaid);
});

test('with both demo flags off the code endpoints do not exist', function () {
    config(['paymongo.simulated' => false, 'paymongo.demo_otp' => false]);
    $user = User::factory()->create();
    $booking = simBooking($user);

    $this->actingAs($user)->postJson("/api/bookings/{$booking->id}/payment/simulated/code", ['mobile' => '09171234567'])->assertNotFound();
});
