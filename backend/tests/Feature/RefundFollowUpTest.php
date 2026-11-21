<?php

use App\Models\AuditLog;
use App\Models\Booking;
use App\Models\User;
use App\Services\Booking\BookingStateMachine;

beforeEach(function () {
    $this->seed(\Database\Seeders\ServiceSeeder::class);
    $this->seed(\Database\Seeders\ParishSettingSeeder::class);
    \Illuminate\Support\Carbon::setTestNow(\Illuminate\Support\Carbon::parse('2026-11-02 00:00:00', 'UTC')); // Mon 08:00 Manila
    \Illuminate\Support\Facades\Storage::fake('local');
    $this->staff = \App\Models\User::factory()->create(['role' => 'staff']);
    $this->admin = \App\Models\User::factory()->create(['role' => 'admin']);
});
afterEach(fn () => \Illuminate\Support\Carbon::setTestNow());

function paidWedding(User $owner, array $extra = []): Booking
{
    $b = Booking::factory()->scheduled('2027-03-03', '10:00', '11:30')->create(array_merge([
        'user_id' => $owner->id, 'sacrament' => 'wedding', 'status' => 'submitted', 'payment_status' => 'unpaid',
        'amount_due_centavos' => 500000, 'payment_hold_expires_at' => now()->addDay(),
        'form_data' => formDataFixture('wedding/valid-basic', $owner->id),
    ], $extra));

    return $b;
}

test('a confirmed payment records the amount received', function () {
    $b = paidWedding(User::factory()->create());
    expect(app(BookingStateMachine::class)->recordPayment($b, 'cs_1', 'pay_1', 500000, 'evt_1'))->toBe('processed');
    expect($b->fresh()->amount_paid_centavos)->toBe(500000);
});

test('refund on an open booking reopens it for payment', function () {
    $owner = User::factory()->create();
    $b = paidWedding($owner, ['payment_status' => 'refund_due', 'amount_paid_centavos' => 400000, 'paymongo_payment_id' => 'pay_short', 'paymongo_checkout_session_id' => 'cs_old', 'paid_at' => now(), 'payment_hold_expires_at' => null]);

    $this->actingAs($this->staff)->patchJson("/api/admin/bookings/{$b->id}/refund", ['reference' => 'PM-REF-1'])
        ->assertOk()->assertJsonPath('paymentStatus', 'unpaid')->assertJsonPath('refundReference', 'PM-REF-1')
        ->assertJsonPath('amountPaidCentavos', null)->assertJsonPath('checkoutSessionId', null);

    $fresh = $b->fresh();
    expect($fresh->payment_hold_expires_at->toISOString())->toBe(now()->addHours(48)->toISOString())
        ->and($fresh->paymongo_payment_id)->toBe('pay_short')
        ->and($fresh->refunded_at)->not->toBeNull();
    $meta = AuditLog::where('action', 'booking.refunded')->where('subject_id', $b->id)->first()->metadata;
    expect($meta['amountCentavos'])->toBe(400000)->and($meta['reopenedForPayment'])->toBeTrue();
    expect(\App\Models\AppNotification::where('user_id', $owner->id)->latest('id')->value('body'))->toContain('pay again');
});

// Review Focus 2
test('a replayed webhook for the refunded payment never marks the booking paid', function () {
    $b = paidWedding(User::factory()->create(), ['payment_status' => 'refund_due', 'amount_paid_centavos' => 400000, 'paymongo_payment_id' => 'pay_short', 'payment_hold_expires_at' => null]);
    $machine = app(BookingStateMachine::class);
    $machine->markRefunded($b, $this->staff, 'PM-REF-1');

    expect($machine->recordPayment($b->fresh(), 'cs_old', 'pay_short', 400000, 'evt_replay'))->toBe('duplicate');
    expect($b->fresh()->payment_status->value)->toBe('unpaid');

    expect($machine->recordPayment($b->fresh(), 'cs_new', 'pay_full', 500000, 'evt_2'))->toBe('processed');
    expect($b->fresh()->payment_status->value)->toBe('paid')->and($b->fresh()->amount_paid_centavos)->toBe(500000);
});

test('refund on a returned booking reopens payment without a 48-hour hold', function () {
    $b = paidWedding(User::factory()->create(), ['status' => 'returned', 'returned_at' => now(), 'payment_status' => 'refund_due', 'amount_paid_centavos' => 500000, 'payment_hold_expires_at' => null]);
    app(BookingStateMachine::class)->markRefunded($b, $this->staff, 'PM-REF-2');
    expect($b->fresh()->payment_status->value)->toBe('unpaid')->and($b->fresh()->payment_hold_expires_at)->toBeNull();
});

test('refund on a closed booking still ends as refunded', function () {
    $b = paidWedding(User::factory()->create(), ['status' => 'cancelled', 'payment_status' => 'refund_due', 'amount_paid_centavos' => 500000, 'payment_hold_expires_at' => null]);
    $this->actingAs($this->staff)->patchJson("/api/admin/bookings/{$b->id}/refund", ['reference' => 'PM-REF-3'])
        ->assertOk()->assertJsonPath('paymentStatus', 'refunded')->assertJsonPath('amountRefundedCentavos', 500000);
});

test('resubmitting while a refund is due is refused', function () {
    $owner = User::factory()->create();
    $owner->forceFill(['email_verified_at' => now()])->save();
    $b = paidWedding($owner, ['status' => 'returned', 'returned_at' => now(), 'payment_status' => 'refund_due', 'payment_hold_expires_at' => null]);
    $this->actingAs($owner)->patchJson("/api/bookings/{$b->id}/submit")->assertUnprocessable()
        ->assertJsonPath('message', 'The parish office is processing a refund for this booking. You can resubmit once it is done.');
    expect($b->fresh()->status->value)->toBe('returned');
});

test('a lower fee on a paid resubmit is flagged as overpaid and can be partly refunded', function () {
    $owner = User::factory()->create();
    $owner->forceFill(['email_verified_at' => now()])->save();
    $data = formDataFixture('baptism/valid-basic', $owner->id);
    $paidFor = count($data['sponsors']) + 1; // paid for one more sponsor than the form now lists
    $b = Booking::factory()->scheduled('2026-11-15', '10:00', '11:00')->create([
        'user_id' => $owner->id, 'sacrament' => 'baptism', 'status' => 'returned', 'returned_at' => now(),
        'payment_status' => 'paid', 'amount_due_centavos' => 5000 * $paidFor, 'amount_paid_centavos' => 5000 * $paidFor, 'form_data' => $data,
    ]);
    AuditLog::create(['actor_user_id' => null, 'action' => 'booking.returned', 'subject_type' => 'booking', 'subject_id' => $b->id,
        'metadata' => ['appointmentDate' => '2026-11-15', 'appointmentStart' => '10:00'], 'created_at' => now()]);

    $this->actingAs($owner)->patchJson("/api/bookings/{$b->id}/submit")->assertOk()->assertJsonPath('paymentStatus', 'paid')->assertJsonPath('overpaidCentavos', 5000);
    expect(AuditLog::where('action', 'booking.overpaid')->where('subject_id', $b->id)->first()->metadata['overpaidCentavos'])->toBe(5000);
    expect(\App\Models\AppNotification::where('user_id', $this->staff->id)->where('title', 'Partial refund due')->exists())->toBeTrue();

    $this->actingAs($this->staff)->patchJson("/api/admin/bookings/{$b->id}/partial-refund", ['reference' => 'PM-PART-1', 'amountCentavos' => 6000])->assertUnprocessable();
    $this->actingAs($this->staff)->patchJson("/api/admin/bookings/{$b->id}/partial-refund", ['reference' => 'PM-PART-1', 'amountCentavos' => 5000])
        ->assertOk()->assertJsonPath('overpaidCentavos', 0)->assertJsonPath('amountRefundedCentavos', 5000)->assertJsonPath('paymentStatus', 'paid');
    $this->actingAs($this->staff)->patchJson("/api/admin/bookings/{$b->id}/partial-refund", ['reference' => 'PM-PART-2', 'amountCentavos' => 1])->assertUnprocessable();
});
test('a confirmed payment auto-approves when the setting is on and documents are cleared', function () {
    config(['paymongo.auto_approve_on_payment' => true]);
    $b = paidWedding(User::factory()->create());
    acceptAllDocuments($b);
    expect(app(BookingStateMachine::class)->recordPayment($b->fresh(), 'cs_1', 'pay_1', 500000, 'evt_auto'))->toBe('processed');
    expect($b->fresh()->status->value)->toBe('approved')->and($b->fresh()->amount_paid_centavos)->toBe(500000);
});
