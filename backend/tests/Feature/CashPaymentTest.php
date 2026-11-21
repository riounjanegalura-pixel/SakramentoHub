<?php

use App\Enums\PaymentStatus;
use App\Models\AppNotification;
use App\Models\AuditLog;
use App\Models\Booking;
use App\Models\User;
use App\Services\PayMongo\WebhookSignature;
use Database\Seeders\ParishSettingSeeder;
use Database\Seeders\ServiceSeeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;

/*
 * Cash at the parish office: the parishioner picks cash for
 * an unpaid, submitted booking; the slot stays held on the same deadline; the
 * office records the cash (with an optional receipt reference) and only then
 * can approve. Every step writes an audit row.
 */

const CASH_WEBHOOK_SECRET = 'whsk_test_cash_secret';

beforeEach(function () {
    $this->seed(ServiceSeeder::class);
    $this->seed(ParishSettingSeeder::class);
    config([
        'paymongo.mode' => 'test',
        'paymongo.secret_key' => 'sk_test_fake',
        'paymongo.webhook_secret' => CASH_WEBHOOK_SECRET,
        'paymongo.base_url' => 'https://api.paymongo.com/v1',
        'paymongo.auto_approve_on_payment' => false,
        'app.parishioner_url' => 'https://parish.example',
    ]);
    Http::preventStrayRequests();
    Carbon::setTestNow(Carbon::parse('2026-11-02 00:00:00', 'UTC'));
    $this->owner = User::factory()->create();
    $this->staff = User::factory()->create(['role' => 'staff']);
    $this->admin = User::factory()->create(['role' => 'admin']);
});

afterEach(fn () => Carbon::setTestNow());

function cashBooking(User $owner, array $overrides = []): Booking
{
    return Booking::factory()->create(array_merge([
        'user_id' => $owner->id,
        'sacrament' => 'wedding',
        'status' => 'submitted',
        'payment_status' => PaymentStatus::Unpaid,
        'payment_hold_expires_at' => now()->addHours(48),
        'amount_due_centavos' => 500000,
        'appointment_date' => '2026-12-12',
        'appointment_start' => '10:00',
        'appointment_end' => '11:30',
    ], $overrides));
}

function cashWebhook($test, Booking $booking, int $amount, string $paymentId = 'pay_cash_case')
{
    $body = json_encode(['data' => ['id' => 'evt_'.uniqid(), 'type' => 'event', 'attributes' => [
        'type' => 'checkout_session.payment.paid',
        'livemode' => false,
        'data' => ['id' => 'cs_cash_case', 'type' => 'checkout_session', 'attributes' => [
            'metadata' => ['booking_id' => $booking->id],
            'payments' => [['id' => $paymentId, 'type' => 'payment', 'attributes' => ['amount' => $amount, 'currency' => 'PHP', 'status' => 'paid']]],
        ]],
    ]]]);

    return $test->call('POST', '/api/webhooks/paymongo', [], [], [], [
        'CONTENT_TYPE' => 'application/json',
        'HTTP_ACCEPT' => 'application/json',
        'HTTP_PAYMONGO_SIGNATURE' => WebhookSignature::sign($body, CASH_WEBHOOK_SECRET),
    ], $body);
}

function auditRows(Booking $booking, string $action)
{
    return AuditLog::where('subject_type', 'booking')->where('subject_id', $booking->id)->where('action', $action)->get();
}

// --- choosing cash ------------------------------------------------------------------

test('the owner chooses cash: pending_cash, method cash, the same hold deadline, the slot still held, an audit row', function () {
    $booking = cashBooking($this->owner);
    $deadline = $booking->payment_hold_expires_at->toISOString();

    $this->actingAs($this->owner)->postJson("/api/bookings/{$booking->id}/payment/cash")
        ->assertOk()
        ->assertJsonPath('paymentStatus', 'pending_cash')
        ->assertJsonPath('paymentMethod', 'cash')
        ->assertJsonPath('paymentHoldExpiresAt', $deadline)
        ->assertJsonPath('cashReceiptReference', null);

    $fresh = $booking->fresh();
    expect($fresh->payment_status)->toBe(PaymentStatus::PendingCash)
        ->and($fresh->status->value)->toBe('submitted')
        ->and(Booking::holdingSlot()->whereKey($booking->id)->exists())->toBeTrue();

    $rows = auditRows($booking, 'booking.cash_chosen');
    expect($rows)->toHaveCount(1)
        ->and($rows[0]->actor_user_id)->toBe($this->owner->id)
        ->and($rows[0]->metadata['holdExpiresAt'])->toBe($deadline);
});

test('the payment status label reads "Cash at the parish office"', function () {
    expect(PaymentStatus::PendingCash->value)->toBe('pending_cash')
        ->and(PaymentStatus::PendingCash->label())->toBe('Cash at the parish office');
});

test('only the owner can choose cash: another parishioner and staff get 404, a guest 401', function () {
    $booking = cashBooking($this->owner);

    $this->actingAs(User::factory()->create())->postJson("/api/bookings/{$booking->id}/payment/cash")->assertNotFound();
    $this->actingAs($this->staff)->postJson("/api/bookings/{$booking->id}/payment/cash")->assertNotFound();
    $this->app['auth']->forgetGuards();
    $this->postJson("/api/bookings/{$booking->id}/payment/cash")->assertUnauthorized();

    expect($booking->fresh()->payment_status)->toBe(PaymentStatus::Unpaid)
        ->and(auditRows($booking, 'booking.cash_chosen'))->toHaveCount(0);
});

test('cash cannot be chosen outside an unpaid, submitted booking with a live hold', function (array $state, string $message) {
    $booking = cashBooking($this->owner, $state);
    $before = $booking->fresh()->payment_status;

    $this->actingAs($this->owner)->postJson("/api/bookings/{$booking->id}/payment/cash")
        ->assertUnprocessable()
        ->assertJsonPath('message', $message);

    expect($booking->fresh()->payment_status)->toBe($before)
        ->and(auditRows($booking, 'booking.cash_chosen'))->toHaveCount(0);
})->with([
    'already paid (paid never goes back to pending_cash)' => [['payment_status' => PaymentStatus::Paid, 'payment_hold_expires_at' => null], 'This booking has already been paid.'],
    'no fee' => [['payment_status' => PaymentStatus::NotRequired, 'payment_hold_expires_at' => null], 'This booking has no payment due.'],
    'refund due' => [['payment_status' => PaymentStatus::RefundDue, 'payment_hold_expires_at' => null], 'This booking has no payment due.'],
    'returned' => [['status' => 'returned', 'returned_at' => now(), 'payment_hold_expires_at' => null], 'Cash at the parish office can be chosen only for a submitted booking that is waiting for payment.'],
    'approved' => [['status' => 'approved', 'payment_status' => PaymentStatus::NotRequired, 'payment_hold_expires_at' => null], 'This booking has no payment due.'],
    'cancelled' => [['status' => 'cancelled', 'payment_status' => PaymentStatus::Void, 'payment_hold_expires_at' => null], 'This booking has no payment due.'],
    'hold lapsed' => [['payment_hold_expires_at' => Carbon::parse('2026-11-01 23:59:00', 'UTC')], 'The payment window for this booking has closed, so its time is no longer held. Please make a new booking.'],
]);

test('a draft cannot choose cash', function () {
    $booking = cashBooking($this->owner, ['status' => 'draft', 'payment_status' => null, 'payment_hold_expires_at' => null]);

    $this->actingAs($this->owner)->postJson("/api/bookings/{$booking->id}/payment/cash")->assertUnprocessable();
    expect($booking->fresh()->payment_status)->toBeNull();
});

test('choosing cash twice is harmless: same state, one audit row', function () {
    $booking = cashBooking($this->owner);

    $this->actingAs($this->owner)->postJson("/api/bookings/{$booking->id}/payment/cash")->assertOk();
    $this->actingAs($this->owner)->postJson("/api/bookings/{$booking->id}/payment/cash")
        ->assertOk()->assertJsonPath('paymentStatus', 'pending_cash');

    expect(auditRows($booking, 'booking.cash_chosen'))->toHaveCount(1);
});

// --- marking cash received ---------------------------------------------------------

test('staff mark the cash received with a receipt reference: paid, recorded, audited, the parishioner told', function () {
    $booking = cashBooking($this->owner, ['payment_status' => PaymentStatus::PendingCash, 'payment_method' => 'cash']);

    $this->actingAs($this->staff)->patchJson("/api/admin/bookings/{$booking->id}/cash-received", ['receiptReference' => ' OR-0042 '])
        ->assertOk()
        ->assertJsonPath('paymentStatus', 'paid')
        ->assertJsonPath('paymentMethod', 'cash')
        ->assertJsonPath('cashReceiptReference', 'OR-0042')
        ->assertJsonPath('amountPaidCentavos', 500000)
        ->assertJsonPath('paymentHoldExpiresAt', null)
        ->assertJsonPath('status', 'submitted');

    $fresh = $booking->fresh();
    expect($fresh->paid_at)->not->toBeNull()
        ->and($fresh->paymongo_payment_id)->toBeNull();

    $rows = auditRows($booking, 'booking.cash_received');
    expect($rows)->toHaveCount(1)
        ->and($rows[0]->actor_user_id)->toBe($this->staff->id)
        ->and($rows[0]->metadata['receiptReference'])->toBe('OR-0042')
        ->and($rows[0]->metadata['amountCentavos'])->toBe(500000);

    $note = AppNotification::where('user_id', $this->owner->id)->where('title', 'Payment Received')->first();
    expect($note)->not->toBeNull()
        ->and($note->body)->toContain('₱5,000.00 cash payment')
        ->and($note->body)->toContain('receipt OR-0042');
});

test('an admin may mark cash received too, and the receipt reference is optional', function () {
    $booking = cashBooking($this->owner, ['payment_status' => PaymentStatus::PendingCash, 'payment_method' => 'cash']);

    $this->actingAs($this->admin)->patchJson("/api/admin/bookings/{$booking->id}/cash-received")
        ->assertOk()
        ->assertJsonPath('paymentStatus', 'paid')
        ->assertJsonPath('cashReceiptReference', null);

    expect(auditRows($booking, 'booking.cash_received')[0]->metadata['receiptReference'])->toBeNull();
});

test('a parishioner cannot mark cash received, not even on their own booking', function () {
    $booking = cashBooking($this->owner, ['payment_status' => PaymentStatus::PendingCash, 'payment_method' => 'cash']);

    $this->actingAs($this->owner)->patchJson("/api/admin/bookings/{$booking->id}/cash-received")->assertForbidden();
    expect($booking->fresh()->payment_status)->toBe(PaymentStatus::PendingCash);
});

test('the receipt reference is at most 120 characters', function () {
    $booking = cashBooking($this->owner, ['payment_status' => PaymentStatus::PendingCash, 'payment_method' => 'cash']);

    $this->actingAs($this->staff)->patchJson("/api/admin/bookings/{$booking->id}/cash-received", ['receiptReference' => str_repeat('x', 121)])
        ->assertUnprocessable()->assertJsonValidationErrors('receiptReference');
});

test('cash can be marked received only on a booking waiting for payment', function (array $state) {
    $booking = cashBooking($this->owner, $state);
    $before = $booking->fresh()->payment_status;

    $this->actingAs($this->staff)->patchJson("/api/admin/bookings/{$booking->id}/cash-received")
        ->assertUnprocessable()
        ->assertJsonPath('message', 'Only a booking waiting for payment can be marked as cash received.');

    expect($booking->fresh()->payment_status)->toBe($before)
        ->and(auditRows($booking, 'booking.cash_received'))->toHaveCount(0);
})->with([
    'already paid' => [['payment_status' => PaymentStatus::Paid, 'payment_hold_expires_at' => null]],
    'no fee' => [['payment_status' => PaymentStatus::NotRequired, 'payment_hold_expires_at' => null]],
    'refund due' => [['payment_status' => PaymentStatus::RefundDue, 'payment_hold_expires_at' => null]],
    'void' => [['payment_status' => PaymentStatus::Void, 'payment_hold_expires_at' => null]],
]);

test('the audit row of a parishioner-chosen cash payment says it came from pending_cash', function () {
    $booking = cashBooking($this->owner, ['payment_status' => PaymentStatus::PendingCash, 'payment_method' => 'cash']);

    $this->actingAs($this->staff)->patchJson("/api/admin/bookings/{$booking->id}/cash-received")->assertOk();

    $meta = auditRows($booking, 'booking.cash_received')[0]->metadata;
    expect($meta['from'])->toBe('pending_cash')
        ->and($meta['fromPendingCash'])->toBeTrue()
        ->and($meta)->not->toHaveKey('fromUnpaid');
});

// --- cash at the desk, straight from unpaid (walk-ins) --------------------------------

test('staff record cash at the counter for an unlinked walk-in straight from unpaid: paid by cash, receipt kept, audited', function () {
    $booking = Booking::factory()->walkIn($this->staff)->create([
        'sacrament' => 'wedding', 'status' => 'submitted', 'payment_status' => PaymentStatus::Unpaid,
        'payment_hold_expires_at' => now()->addHours(48), 'amount_due_centavos' => 500000,
        'appointment_date' => '2026-12-12', 'appointment_start' => '10:00', 'appointment_end' => '11:30',
    ]);
    expect($booking->user_id)->toBeNull();

    $this->actingAs($this->staff)->patchJson("/api/admin/bookings/{$booking->id}/cash-received", ['receiptReference' => 'OR-0100'])
        ->assertOk()
        ->assertJsonPath('paymentStatus', 'paid')
        ->assertJsonPath('paymentMethod', 'cash')
        ->assertJsonPath('cashReceiptReference', 'OR-0100')
        ->assertJsonPath('amountPaidCentavos', 500000)
        ->assertJsonPath('paymentHoldExpiresAt', null);

    $rows = auditRows($booking, 'booking.cash_received');
    expect($rows)->toHaveCount(1)
        ->and($rows[0]->actor_user_id)->toBe($this->staff->id)
        ->and($rows[0]->metadata['from'])->toBe('unpaid')
        ->and($rows[0]->metadata['fromUnpaid'])->toBeTrue()
        ->and($rows[0]->metadata['receiptReference'])->toBe('OR-0100');

    // paid is terminal: a second recording is refused and changes nothing.
    $this->actingAs($this->staff)->patchJson("/api/admin/bookings/{$booking->id}/cash-received", ['receiptReference' => 'OR-0101'])->assertUnprocessable();
    expect($booking->fresh()->cash_receipt_reference)->toBe('OR-0100')
        ->and(auditRows($booking, 'booking.cash_received'))->toHaveCount(1);
});

test('cash from unpaid is refused once the hold has lapsed', function () {
    $booking = Booking::factory()->walkIn($this->staff)->create([
        'sacrament' => 'wedding', 'status' => 'submitted', 'payment_status' => PaymentStatus::Unpaid,
        'payment_hold_expires_at' => now()->subMinute(), 'amount_due_centavos' => 500000,
        'appointment_date' => '2026-12-12', 'appointment_start' => '10:00', 'appointment_end' => '11:30',
    ]);

    $this->actingAs($this->staff)->patchJson("/api/admin/bookings/{$booking->id}/cash-received")
        ->assertUnprocessable()
        ->assertJsonPath('message', 'The hold on this booking has lapsed, so its time is no longer held. Do not take the cash: the parishioner needs to make a new booking.');

    expect($booking->fresh()->payment_status)->toBe(PaymentStatus::Unpaid)
        ->and(auditRows($booking, 'booking.cash_received'))->toHaveCount(0);
});

test('a parishioner cannot record cash on their own unpaid booking', function () {
    $booking = cashBooking($this->owner);

    $this->actingAs($this->owner)->patchJson("/api/admin/bookings/{$booking->id}/cash-received")->assertForbidden();
    expect($booking->fresh()->payment_status)->toBe(PaymentStatus::Unpaid);
});

test('an online parishioner who turns up with cash without choosing it first can be recorded too, and is told', function () {
    $booking = cashBooking($this->owner);

    $this->actingAs($this->admin)->patchJson("/api/admin/bookings/{$booking->id}/cash-received")
        ->assertOk()->assertJsonPath('paymentStatus', 'paid')->assertJsonPath('paymentMethod', 'cash');
    expect(AppNotification::where('user_id', $this->owner->id)->where('title', 'Payment Received')->exists())->toBeTrue();
});

// --- refund reopen clears the cash fields ----------------------------------------------

test('a refund that reopens payment clears the payment method and cash receipt, so a later GCash payment shows no stale receipt', function () {
    $booking = cashBooking($this->owner, [
        'payment_status' => PaymentStatus::RefundDue, 'payment_method' => 'cash', 'cash_receipt_reference' => 'OR-7',
        'payment_hold_expires_at' => null, 'amount_paid_centavos' => 500000, 'paid_at' => now(),
    ]);

    $this->actingAs($this->staff)->patchJson("/api/admin/bookings/{$booking->id}/refund", ['reference' => 'RF-1'])
        ->assertOk()
        ->assertJsonPath('paymentStatus', 'unpaid')
        ->assertJsonPath('paymentMethod', null)
        ->assertJsonPath('cashReceiptReference', null);

    cashWebhook($this, $booking, 500000, 'pay_after_refund')->assertOk()->assertJsonPath('result', 'processed');
    expect($booking->fresh()->payment_method)->toBe('gcash')
        ->and($booking->fresh()->cash_receipt_reference)->toBeNull();
});

test('marking cash received twice is refused the second time', function () {
    $booking = cashBooking($this->owner, ['payment_status' => PaymentStatus::PendingCash, 'payment_method' => 'cash']);

    $this->actingAs($this->staff)->patchJson("/api/admin/bookings/{$booking->id}/cash-received", ['receiptReference' => 'OR-1'])->assertOk();
    $this->actingAs($this->staff)->patchJson("/api/admin/bookings/{$booking->id}/cash-received", ['receiptReference' => 'OR-2'])->assertUnprocessable();

    expect($booking->fresh()->cash_receipt_reference)->toBe('OR-1')
        ->and(auditRows($booking, 'booking.cash_received'))->toHaveCount(1);
});

test('cash is refused once the hold has lapsed: the time is no longer held', function () {
    $booking = cashBooking($this->owner, ['payment_status' => PaymentStatus::PendingCash, 'payment_method' => 'cash', 'payment_hold_expires_at' => now()->subMinute()]);

    $this->actingAs($this->staff)->patchJson("/api/admin/bookings/{$booking->id}/cash-received")
        ->assertUnprocessable()
        ->assertJsonPath('message', 'The hold on this booking has lapsed, so its time is no longer held. Do not take the cash: the parishioner needs to make a new booking.');

    expect($booking->fresh()->payment_status)->toBe(PaymentStatus::PendingCash);
});

test('cash on a closed booking is refused', function () {
    $booking = cashBooking($this->owner, ['status' => 'cancelled', 'payment_status' => PaymentStatus::PendingCash, 'payment_method' => 'cash']);

    $this->actingAs($this->staff)->patchJson("/api/admin/bookings/{$booking->id}/cash-received")->assertUnprocessable();
    expect($booking->fresh()->payment_status)->toBe(PaymentStatus::PendingCash);
});

// --- approval gating ------------------------------------------------------------

test('approval waits for the cash to be recorded, then goes through', function () {
    $booking = cashBooking($this->owner, ['payment_status' => PaymentStatus::PendingCash, 'payment_method' => 'cash']);

    $this->actingAs($this->staff)->patchJson("/api/admin/bookings/{$booking->id}/approve")
        ->assertUnprocessable()
        ->assertJsonPath('message', 'This booking cannot be approved until the cash payment is received and recorded.');
    expect($booking->fresh()->status->value)->toBe('submitted');

    $this->actingAs($this->staff)->patchJson("/api/admin/bookings/{$booking->id}/cash-received")->assertOk();
    $this->actingAs($this->staff)->patchJson("/api/admin/bookings/{$booking->id}/approve")
        ->assertOk()->assertJsonPath('status', 'approved');
});

// --- hold expiry ----------------------------------------------------------------

test('the expiry job cancels a pending_cash booking past its hold, like an unpaid one, and leaves a live one', function () {
    $expired = cashBooking($this->owner, ['payment_status' => PaymentStatus::PendingCash, 'payment_method' => 'cash', 'payment_hold_expires_at' => now()->subMinute()]);
    $live = cashBooking($this->owner, ['payment_status' => PaymentStatus::PendingCash, 'payment_method' => 'cash', 'appointment_date' => '2026-12-19']);

    expect(Booking::holdingSlot()->whereKey($expired->id)->exists())->toBeFalse()
        ->and(Booking::holdingSlot()->whereKey($live->id)->exists())->toBeTrue();

    $this->artisan('bookings:expire-holds')->assertSuccessful();

    expect($expired->fresh()->status->value)->toBe('cancelled')
        ->and($expired->fresh()->payment_status)->toBe(PaymentStatus::Void)
        ->and($expired->fresh()->status_reason)->toStartWith('Payment not completed by ')
        ->and($live->fresh()->status->value)->toBe('submitted')
        ->and($live->fresh()->payment_status)->toBe(PaymentStatus::PendingCash);
});

test('cancelling a pending_cash booking voids the payment, with nothing to refund', function () {
    $booking = cashBooking($this->owner, ['payment_status' => PaymentStatus::PendingCash, 'payment_method' => 'cash']);

    $this->actingAs($this->owner)->patchJson("/api/bookings/{$booking->id}/cancel", ['reason' => 'Changed plans'])->assertOk();

    expect($booking->fresh()->payment_status)->toBe(PaymentStatus::Void)
        ->and($booking->fresh()->payment_hold_expires_at)->toBeNull();
});

// --- GCash after choosing cash -----------------------------------------------------

test('a GCash payment arriving after cash was chosen still marks the booking paid by GCash', function () {
    $booking = cashBooking($this->owner, ['payment_status' => PaymentStatus::PendingCash, 'payment_method' => 'cash']);

    cashWebhook($this, $booking, 500000)->assertOk()->assertJsonPath('result', 'processed');

    $fresh = $booking->fresh();
    expect($fresh->payment_status)->toBe(PaymentStatus::Paid)
        ->and($fresh->payment_method)->toBe('gcash')
        ->and($fresh->paymongo_payment_id)->toBe('pay_cash_case')
        ->and(auditRows($booking, 'booking.payment_confirmed'))->toHaveCount(1);

    // The office can no longer take cash for it.
    $this->actingAs($this->staff)->patchJson("/api/admin/bookings/{$booking->id}/cash-received")->assertUnprocessable();
});

test('a GCash payment after the cash was recorded is flagged for refund, and the booking stays paid by cash', function () {
    $booking = cashBooking($this->owner, ['payment_status' => PaymentStatus::PendingCash, 'payment_method' => 'cash']);
    $this->actingAs($this->staff)->patchJson("/api/admin/bookings/{$booking->id}/cash-received", ['receiptReference' => 'OR-9'])->assertOk();

    cashWebhook($this, $booking, 500000)->assertOk()->assertJsonPath('result', 'refund_due');

    expect($booking->fresh()->payment_status)->toBe(PaymentStatus::Paid)
        ->and($booking->fresh()->payment_method)->toBe('cash')
        ->and(auditRows($booking, 'booking.payment_extra'))->toHaveCount(1);
});

test('the parishioner can still switch to GCash while cash is pending', function () {
    Http::fake(['api.paymongo.com/v1/checkout_sessions' => Http::response(['data' => [
        'id' => 'cs_switch', 'type' => 'checkout_session',
        'attributes' => ['checkout_url' => 'https://checkout.paymongo.com/cs_switch', 'status' => 'active'],
    ]])]);
    $booking = cashBooking($this->owner, ['payment_status' => PaymentStatus::PendingCash, 'payment_method' => 'cash']);

    $this->actingAs($this->owner)->postJson("/api/bookings/{$booking->id}/payment")
        ->assertOk()->assertJsonPath('checkoutUrl', 'https://checkout.paymongo.com/cs_switch');
});

test('a pending_cash booking returned for changes stays pending_cash when resubmitted, with a fresh hold', function () {
    $booking = Booking::factory()->create([
        'user_id' => $this->owner->id,
        'sacrament' => 'baptism',
        'status' => 'returned',
        'returned_at' => now(),
        'form_data' => formDataFixture('baptism/valid-basic', $this->owner->id),
        'appointment_date' => '2026-11-15',
        'appointment_start' => '10:00',
        'payment_status' => PaymentStatus::PendingCash,
        'payment_method' => 'cash',
        'amount_due_centavos' => 10000,
    ]);

    $this->actingAs($this->owner)->patchJson("/api/bookings/{$booking->id}/submit")
        ->assertOk()
        ->assertJsonPath('paymentStatus', 'pending_cash')
        ->assertJsonPath('paymentMethod', 'cash');

    expect($booking->fresh()->payment_hold_expires_at)->not->toBeNull();
});

// --- recording cash closes any open GCash checkout ------------------------------------

test('recording cash expires an open PayMongo checkout session so the parishioner cannot also pay online', function () {
    Http::fake(['api.paymongo.com/v1/checkout_sessions/cs_open/expire' => Http::response(['data' => ['id' => 'cs_open']])]);
    $booking = cashBooking($this->owner, ['payment_status' => PaymentStatus::PendingCash, 'payment_method' => 'cash', 'paymongo_checkout_session_id' => 'cs_open']);

    $this->actingAs($this->staff)->patchJson("/api/admin/bookings/{$booking->id}/cash-received")->assertOk()->assertJsonPath('paymentStatus', 'paid');

    Http::assertSent(fn ($request) => str_ends_with($request->url(), '/checkout_sessions/cs_open/expire'));
});

test('recording cash still succeeds when the checkout session cannot be expired', function () {
    Http::fake(['api.paymongo.com/v1/checkout_sessions/cs_open/expire' => Http::response(['errors' => [['detail' => 'down']]], 500)]);
    $booking = cashBooking($this->owner, ['paymongo_checkout_session_id' => 'cs_open']);

    $this->actingAs($this->staff)->patchJson("/api/admin/bookings/{$booking->id}/cash-received")->assertOk()->assertJsonPath('paymentStatus', 'paid');
});

test('recording cash with no checkout session calls PayMongo not at all', function () {
    Http::fake();
    $booking = cashBooking($this->owner, ['payment_status' => PaymentStatus::PendingCash, 'payment_method' => 'cash']);

    $this->actingAs($this->staff)->patchJson("/api/admin/bookings/{$booking->id}/cash-received")->assertOk();

    Http::assertNothingSent();
});

// --- refund wording for cash --------------------------------------------------------

test('closing a cash-paid booking tells staff to return the cash at the parish office, not PayMongo', function () {
    $booking = cashBooking($this->owner, ['payment_status' => PaymentStatus::Paid, 'payment_method' => 'cash', 'payment_hold_expires_at' => null, 'amount_paid_centavos' => 500000, 'paid_at' => now()]);

    $this->actingAs($this->staff)->patchJson("/api/admin/bookings/{$booking->id}/decline", ['reason' => 'Requirements incomplete'])->assertOk();

    $note = AppNotification::where('user_id', $this->staff->id)->where('title', 'Refund due')->sole();
    expect($booking->fresh()->payment_status)->toBe(PaymentStatus::RefundDue)
        ->and($note->body)->toContain('paid in cash at the parish office')
        ->and($note->body)->toContain('return it there')
        ->and($note->body)->not->toContain('PayMongo');
});

test('closing a GCash-paid booking still tells staff to refund in the PayMongo dashboard', function () {
    $booking = cashBooking($this->owner, ['payment_status' => PaymentStatus::Paid, 'payment_method' => 'gcash', 'payment_hold_expires_at' => null, 'amount_paid_centavos' => 500000, 'paid_at' => now()]);

    $this->actingAs($this->staff)->patchJson("/api/admin/bookings/{$booking->id}/decline", ['reason' => 'Requirements incomplete'])->assertOk();

    expect(AppNotification::where('user_id', $this->staff->id)->where('title', 'Refund due')->sole()->body)->toContain('PayMongo dashboard');
});

test('a cash refund tells the parishioner the money was returned at the parish office, not GCash', function (array $state, string $expected) {
    $booking = cashBooking($this->owner, $state + [
        'payment_status' => PaymentStatus::RefundDue, 'payment_method' => 'cash', 'cash_receipt_reference' => 'OR-7',
        'payment_hold_expires_at' => null, 'amount_paid_centavos' => 500000, 'paid_at' => now(),
    ]);

    $this->actingAs($this->staff)->patchJson("/api/admin/bookings/{$booking->id}/refund", ['reference' => 'RF-1'])->assertOk();

    $body = AppNotification::where('user_id', $this->owner->id)->where('title', 'Refund processed')->sole()->body;
    expect($body)->toContain($expected)
        ->and($body)->toContain('parish office')
        ->and($body)->not->toContain('GCash');
})->with([
    'reopened for payment' => [[], 'Your cash payment of ₱5,000.00'],
    'closed booking' => [['status' => 'declined'], 'Your cash payment of ₱5,000.00'],
]);

test('a GCash refund still names GCash to the parishioner', function () {
    $booking = cashBooking($this->owner, [
        'status' => 'declined', 'payment_status' => PaymentStatus::RefundDue, 'payment_method' => 'gcash',
        'payment_hold_expires_at' => null, 'amount_paid_centavos' => 500000, 'paid_at' => now(),
    ]);

    $this->actingAs($this->staff)->patchJson("/api/admin/bookings/{$booking->id}/refund", ['reference' => 'RF-1'])->assertOk();

    expect(AppNotification::where('user_id', $this->owner->id)->where('title', 'Refund processed')->sole()->body)->toContain('GCash refund');
});

test('a GCash booking reports its payment method once the webhook lands', function () {
    $booking = cashBooking($this->owner);

    cashWebhook($this, $booking, 500000)->assertOk()->assertJsonPath('result', 'processed');

    $this->actingAs($this->owner)->getJson("/api/bookings/{$booking->id}")
        ->assertOk()->assertJsonPath('paymentMethod', 'gcash')->assertJsonPath('cashReceiptReference', null);
});
