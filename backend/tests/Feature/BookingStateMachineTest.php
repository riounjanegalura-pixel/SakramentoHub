<?php

use App\Enums\BookingStatus;
use App\Enums\PaymentStatus;
use App\Exceptions\BookingRuleViolation;
use App\Models\AppNotification;
use App\Models\AuditLog;
use App\Models\Booking;
use App\Models\User;
use App\Services\Booking\BookingStateMachine;
use Database\Seeders\ParishSettingSeeder;
use Database\Seeders\ServiceSeeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

beforeEach(function () {
    $this->seed(ServiceSeeder::class);
    $this->seed(ParishSettingSeeder::class);
    Storage::fake('local');
    Carbon::setTestNow(Carbon::parse('2026-11-02 00:00:00', 'UTC')); // Mon 08:00 Manila
    config(['paymongo.secret_key' => 'sk_test_x']);
    Http::fake(['*' => Http::response(['data' => ['id' => 'cs_1', 'attributes' => ['status' => 'expired', 'checkout_url' => 'https://x']]])]);
    $this->sm = app(BookingStateMachine::class);
    $this->owner = User::factory()->create(['email_verified_at' => now()]);
    $this->staff = User::factory()->create(['role' => 'staff']);
});

afterEach(fn () => Carbon::setTestNow());

function draftFor(User $owner, string $sacrament, string $fixture, ?string $date, ?string $start, array $extra = []): Booking
{
    return Booking::factory()->create(array_merge([
        'user_id' => $owner->id,
        'sacrament' => $sacrament,
        'status' => 'draft',
        'form_data' => formDataFixture($fixture, $owner->id),
        'appointment_date' => $date,
        'appointment_start' => $start,
    ], $extra));
}

test('submitting a priced booking holds the slot for 48 hours unpaid', function () {
    $b = $this->sm->submit(draftFor($this->owner, 'wedding', 'wedding/valid-basic', '2027-02-02', '09:30'), $this->owner);

    expect($b->status)->toBe(BookingStatus::Submitted)
        ->and($b->payment_status)->toBe(PaymentStatus::Unpaid)
        ->and($b->amount_due_centavos)->toBe(500000)
        ->and($b->appointment_end)->toBe('11:00')
        ->and($b->payment_hold_expires_at->equalTo(now()->addHours(48)))->toBeTrue();
});

test('baptism fee is per sponsor', function () {
    $b = $this->sm->submit(draftFor($this->owner, 'baptism', 'baptism/valid-basic', '2026-11-15', '10:00'), $this->owner);
    expect($b->amount_due_centavos)->toBe(10000); // ₱50 × 2 sponsors
});

test('a free sacrament needs no payment and a house funeral is off-site', function () {
    $b = $this->sm->submit(draftFor($this->owner, 'funeral', 'funeral/valid-basic', '2026-11-03', '10:00'), $this->owner);

    expect($b->payment_status)->toBe(PaymentStatus::NotRequired)
        ->and($b->payment_hold_expires_at)->toBeNull()
        ->and($b->is_offsite)->toBeTrue();
});

test('submit rejects incomplete form data', function () {
    $draft = Booking::factory()->create([
        'user_id' => $this->owner->id, 'sacrament' => 'funeral', 'form_data' => [],
        'appointment_date' => '2026-11-03', 'appointment_start' => '10:00',
    ]);
    $this->sm->submit($draft, $this->owner);
})->throws(ValidationException::class);

test('submit rejects a time already taken by another sacrament', function () {
    $this->sm->submit(draftFor($this->owner, 'funeral', 'funeral/valid-basic', '2026-11-03', '10:00'), $this->owner);
    $other = User::factory()->create();
    $this->sm->submit(draftFor($other, 'anointing', 'anointing/valid-hospital', '2026-11-03', '10:00'), $other);
})->throws(BookingRuleViolation::class, 'That time is no longer available. Please choose another.');

test('an emergency anointing skips scheduling and alerts staff', function () {
    $this->owner->update(['phone' => '09171234567']);
    $draft = draftFor($this->owner, 'anointing', 'anointing/valid-hospital', null, null);
    $draft->form_data = array_merge($draft->form_data, ['inDangerOfDeath' => true]);
    $draft->save();

    $b = $this->sm->submit($draft, $this->owner);

    expect($b->is_emergency)->toBeTrue()
        ->and($b->appointment_date)->toBeNull()
        ->and(AppNotification::where('user_id', $this->staff->id)->where('title', 'Urgent anointing request')->exists())->toBeTrue();
});

function urgentAnointing(User $owner, array $form = []): Booking
{
    $draft = draftFor($owner, 'anointing', 'anointing/valid-hospital', null, null);
    $draft->form_data = array_merge($draft->form_data, ['inDangerOfDeath' => true], $form);
    $draft->save();

    return $draft;
}

test('an urgent anointing with no mobile number to call is refused before anything changes', function () {
    $this->owner->update(['phone' => '']);
    $draft = urgentAnointing($this->owner);

    try {
        $this->sm->submit($draft, $this->owner);
        $this->fail('expected a validation error');
    } catch (ValidationException $e) {
        expect($e->errors())->toHaveKey('formData.alternatePhone')
            ->and($e->errors()['formData.alternatePhone'][0])->toBe('Add a mobile number we can call right now (09XXXXXXXXX). The priest needs it to reach you.');
    }
    expect($draft->fresh()->status)->toBe(BookingStatus::Draft)
        ->and(AppNotification::where('title', 'Urgent anointing request')->exists())->toBeFalse();
});

test('an urgent anointing alert lists every reachable mobile number once', function () {
    $this->owner->update(['phone' => '+63 917-123-4567']);
    $b = $this->sm->submit(urgentAnointing($this->owner, ['alternatePhone' => '09187654321']), $this->owner);

    $alert = AppNotification::where('user_id', $this->staff->id)->where('title', 'Urgent anointing request')->first();
    expect($alert->body)->toContain("Patient in danger of death — {$b->reference_number}. Contact the family right away: 09171234567 or 09187654321.");
});

test('an urgent anointing accepts the alternate number alone and a duplicate number once', function () {
    $this->owner->update(['phone' => '']);
    $b = $this->sm->submit(urgentAnointing($this->owner, ['alternatePhone' => '09181234567']), $this->owner);
    expect($b->is_emergency)->toBeTrue();

    $other = User::factory()->create(['phone' => '09181234567']);
    $this->sm->submit(urgentAnointing($other, ['alternatePhone' => '09181234567']), $other);
    $body = AppNotification::where('user_id', $this->staff->id)->latest('id')->first()->body;
    expect($body)->toEndWith('Contact the family right away: 09181234567.');
});

test('a non-emergency anointing needs no phone', function () {
    $this->owner->update(['phone' => '']);
    $b = $this->sm->submit(draftFor($this->owner, 'anointing', 'anointing/valid-hospital', '2026-11-03', '10:00'), $this->owner);
    expect($b->status)->toBe(BookingStatus::Submitted);
});

test('approve requires confirmed payment for a priced booking', function () {
    $b = $this->sm->submit(draftFor($this->owner, 'wedding', 'wedding/valid-basic', '2027-02-02', '09:30'), $this->owner);
    $this->sm->approve($b, $this->staff);
})->throws(BookingRuleViolation::class, 'cannot be approved until its GCash payment is confirmed');

test('approve succeeds for a free booking and notifies the owner', function () {
    $b = $this->sm->submit(draftFor($this->owner, 'funeral', 'funeral/valid-basic', '2026-11-03', '10:00'), $this->owner);
    acceptAllDocuments($b);
    $b = $this->sm->approve($b, $this->staff);

    expect($b->status)->toBe(BookingStatus::Approved)
        ->and(AppNotification::where('user_id', $this->owner->id)->where('title', 'Booking Approved')->exists())->toBeTrue()
        ->and(AuditLog::where('action', 'booking.approved')->exists())->toBeTrue();
});

test('approving a booking whose owner deleted their account does not crash', function () {
    $b = $this->sm->submit(draftFor($this->owner, 'funeral', 'funeral/valid-basic', '2026-11-03', '10:00'), $this->owner);
    $b->update(['user_id' => null]);
    acceptAllDocuments($b);

    expect($this->sm->approve($b->fresh(), $this->staff)->status)->toBe(BookingStatus::Approved);
});

test('returning a booking clears the payment hold and keeps the slot 7 days', function () {
    $b = $this->sm->submit(draftFor($this->owner, 'wedding', 'wedding/valid-basic', '2027-02-02', '09:30'), $this->owner);
    $b = $this->sm->returnForChanges($b, $this->staff, 'Please re-upload a clearer CENOMAR.');

    expect($b->status)->toBe(BookingStatus::Returned)
        ->and($b->return_note)->toBe('Please re-upload a clearer CENOMAR.')
        ->and($b->payment_hold_expires_at)->toBeNull()
        ->and(Booking::holdingSlot()->whereKey($b->id)->exists())->toBeTrue();
});

test('resubmitting a returned booking whose time was taken meanwhile fails and stays returned', function () {
    $b = $this->sm->submit(draftFor($this->owner, 'funeral', 'funeral/valid-basic', '2026-11-03', '10:00'), $this->owner);
    $b = $this->sm->returnForChanges($b, $this->staff, 'Fix the burial date.');
    Carbon::setTestNow(now()->addDays(8)); // original date is now past, so the parishioner picks a new one below
    // The burial date was fixed relative to the old "today"; a new one is chosen along with the new time.
    $b->update(['appointment_date' => '2026-11-12', 'appointment_start' => '10:00', 'form_data' => array_merge($b->form_data, ['burialDate' => now()->addDays(3)->toDateString()])]);
    $other = User::factory()->create();
    $this->sm->submit(draftFor($other, 'anointing', 'anointing/valid-hospital', '2026-11-12', '10:00'), $other);

    expect(fn () => $this->sm->submit($b->fresh(), $this->owner))
        ->toThrow(BookingRuleViolation::class, 'That time is no longer available. Please choose another.')
        ->and($b->fresh()->status)->toBe(BookingStatus::Returned);
});

test('declining a paid booking makes the refund due and alerts staff', function () {
    $b = $this->sm->submit(draftFor($this->owner, 'wedding', 'wedding/valid-basic', '2027-02-02', '09:30'), $this->owner);
    $b->update(['payment_status' => 'paid']);
    $b = $this->sm->decline($b, $this->staff, 'Incomplete requirements');

    expect($b->status)->toBe(BookingStatus::Declined)
        ->and($b->status_reason)->toBe('Incomplete requirements')
        ->and($b->payment_status)->toBe(PaymentStatus::RefundDue)
        ->and(AppNotification::where('user_id', $this->staff->id)->where('title', 'Refund due')->exists())->toBeTrue();
});

test('cancelling an unpaid booking voids it and expires the checkout session', function () {
    $b = $this->sm->submit(draftFor($this->owner, 'wedding', 'wedding/valid-basic', '2027-02-02', '09:30'), $this->owner);
    $b->update(['paymongo_checkout_session_id' => 'cs_1']);
    $b = $this->sm->cancel($b, $this->owner, 'Changed plans');

    expect($b->status)->toBe(BookingStatus::Cancelled)
        ->and($b->payment_status)->toBe(PaymentStatus::Void);
    Http::assertSent(fn ($request) => str_ends_with($request->url(), '/checkout_sessions/cs_1/expire'));
});

test('a parishioner cannot cancel an approved booking within 3 days, staff can', function () {
    $b = $this->sm->submit(draftFor($this->owner, 'funeral', 'funeral/valid-basic', '2026-11-04', '10:00'), $this->owner);
    acceptAllDocuments($b);
    $b = $this->sm->approve($b, $this->staff);

    expect(fn () => $this->sm->cancel($b, $this->owner, 'x'))
        ->toThrow(BookingRuleViolation::class, 'until 3 days before the appointment');
    expect($this->sm->cancel($b->fresh(), $this->staff, 'Family request')->status)->toBe(BookingStatus::Cancelled);
});

test('a parishioner may cancel an approved booking 3 or more days ahead', function () {
    $b = $this->sm->submit(draftFor($this->owner, 'funeral', 'funeral/valid-basic', '2026-11-05', '10:00'), $this->owner);
    acceptAllDocuments($b);
    $b = $this->sm->approve($b, $this->staff);
    expect($this->sm->cancel($b, $this->owner, 'Moved')->status)->toBe(BookingStatus::Cancelled);
});

test('complete is only allowed on or after the appointment date', function () {
    $b = $this->sm->submit(draftFor($this->owner, 'funeral', 'funeral/valid-basic', '2026-11-03', '10:00'), $this->owner);
    acceptAllDocuments($b);
    $b = $this->sm->approve($b, $this->staff);

    expect(fn () => $this->sm->complete($b, $this->staff))
        ->toThrow(BookingRuleViolation::class, 'on or after its appointment date');

    Carbon::setTestNow(Carbon::parse('2026-11-03 02:00:00', 'UTC'));
    expect($this->sm->complete($b->fresh(), $this->staff)->status)->toBe(BookingStatus::Completed);
});

test('an invalid transition is refused', function () {
    $b = Booking::factory()->create(['status' => 'completed']);
    $this->sm->decline($b, $this->staff, 'x');
})->throws(BookingRuleViolation::class, "can't be declined");

test('mark refunded requires a refund to be due', function () {
    $b = Booking::factory()->create(['status' => 'cancelled', 'payment_status' => 'refund_due']);
    $b = $this->sm->markRefunded($b, $this->staff, 'PM-REF-123', 'GCash reversal');

    expect($b->payment_status)->toBe(PaymentStatus::Refunded)->and($b->refund_reference)->toBe('PM-REF-123');
    expect(fn () => $this->sm->markRefunded($b, $this->staff, 'again'))->toThrow(BookingRuleViolation::class);
});

test('payment arriving for a cancelled booking becomes refund due, never paid', function () {
    $b = Booking::factory()->create(['status' => 'cancelled', 'payment_status' => 'void', 'amount_due_centavos' => 500000]);

    expect($this->sm->recordPayment($b, 'cs_1', 'pay_1', 500000, 'evt_1'))->toBe('refund_due')
        ->and($b->fresh()->payment_status)->toBe(PaymentStatus::RefundDue)
        ->and($b->fresh()->status)->toBe(BookingStatus::Cancelled)
        ->and($this->sm->recordPayment($b->fresh(), 'cs_1', 'pay_1', 500000, 'evt_1'))->toBe('duplicate');
});

test('an underpayment on an open booking becomes refund due instead of paid', function () {
    $b = $this->sm->submit(draftFor($this->owner, 'wedding', 'wedding/valid-basic', '2027-02-02', '09:30'), $this->owner);

    expect($this->sm->recordPayment($b, 'cs_1', 'pay_1', 100000, 'evt_1'))->toBe('refund_due')
        ->and($b->fresh()->payment_status)->toBe(PaymentStatus::RefundDue)
        ->and($b->fresh()->status)->toBe(BookingStatus::Submitted);
});

test('payment for an open unpaid booking is recorded', function () {
    $b = $this->sm->submit(draftFor($this->owner, 'wedding', 'wedding/valid-basic', '2027-02-02', '09:30'), $this->owner);

    expect($this->sm->recordPayment($b, 'cs_1', 'pay_1', 500000, 'evt_1'))->toBe('processed')
        ->and($b->fresh()->payment_status)->toBe(PaymentStatus::Paid)
        ->and($this->sm->recordPayment($b->fresh(), 'cs_1', 'pay_1', 500000, 'evt_1'))->toBe('duplicate');
});

test('reschedule of an approved booking returns it to review and alerts staff', function () {
    $b = $this->sm->submit(draftFor($this->owner, 'funeral', 'funeral/valid-basic', '2026-11-06', '10:00'), $this->owner);
    acceptAllDocuments($b);
    $b = $this->sm->approve($b, $this->staff);
    $b = $this->sm->reschedule($b, $this->owner, '2026-11-05', '13:00');

    expect($b->status)->toBe(BookingStatus::Submitted)
        ->and($b->appointmentDateString())->toBe('2026-11-05')
        ->and($b->appointment_end)->toBe('14:00')
        ->and(AppNotification::where('user_id', $this->staff->id)->where('title', 'Approved booking rescheduled')->exists())->toBeTrue();
});

test('replaying the same payment id after a refund is a duplicate', function () {
    $b = Booking::factory()->create(['status' => 'cancelled', 'payment_status' => 'void', 'amount_due_centavos' => 500000]);
    $this->sm->recordPayment($b, 'cs_1', 'pay_1', 500000, 'evt_1');
    $this->sm->markRefunded($b->fresh(), $this->staff, 'PM-REF-1');

    expect($this->sm->recordPayment($b->fresh(), 'cs_1', 'pay_1', 500000, 'evt_1'))->toBe('duplicate')
        ->and($b->fresh()->payment_status)->toBe(PaymentStatus::Refunded);
});

test('a second different payment on a paid booking is flagged for refund and the first is kept', function () {
    $b = $this->sm->submit(draftFor($this->owner, 'wedding', 'wedding/valid-basic', '2027-02-02', '09:30'), $this->owner);
    $this->sm->recordPayment($b, 'cs_1', 'pay_1', 500000, 'evt_1');

    expect($this->sm->recordPayment($b->fresh(), 'cs_2', 'pay_2', 500000, 'evt_2'))->toBe('refund_due')
        ->and($b->fresh()->payment_status)->toBe(PaymentStatus::Paid)
        ->and($b->fresh()->paymongo_payment_id)->toBe('pay_1')
        ->and(AuditLog::where('action', 'booking.payment_extra')->exists())->toBeTrue()
        ->and(AppNotification::where('user_id', $this->staff->id)->where('title', 'Refund due')->exists())->toBeTrue();
});

test('resubmitting a paid returned baptism whose fee rises is refused and stays returned', function () {
    $b = draftFor($this->owner, 'baptism', 'baptism/valid-basic', '2026-11-15', '10:00');
    $b = $this->sm->submit($b, $this->owner);
    $this->sm->recordPayment($b, 'cs_1', 'pay_1', 10000, 'evt_1');
    $b = $this->sm->returnForChanges($b->fresh(), $this->staff, 'Add a sponsor.');
    $fd = $b->form_data;
    $fd['sponsors'][] = $fd['sponsors'][0];
    $b->form_data = $fd;
    $b->save();

    expect(fn () => $this->sm->submit($b->fresh(), $this->owner))
        ->toThrow(BookingRuleViolation::class, 'raise the fee')
        ->and($b->fresh()->status)->toBe(BookingStatus::Returned);
});

// Lead time and the same-day "an hour from now" cutoff are booking-time rules:
// they apply when a slot is first taken, not when the slot a booking already
// holds is re-checked days later.

test('a booking made at the minimum lead time can still be approved two days later', function () {
    $b = $this->sm->submit(draftFor($this->owner, 'confirmation', 'confirmation/valid-basic', '2026-11-17', '10:00'), $this->owner);
    Carbon::setTestNow(now()->addDays(2));
    acceptAllDocuments($b);

    expect($this->sm->approve($b, $this->staff)->status)->toBe(BookingStatus::Approved);
});

test('a returned booking can be resubmitted days later with the slot it still holds', function () {
    $b = $this->sm->submit(draftFor($this->owner, 'confirmation', 'confirmation/valid-basic', '2026-11-17', '10:00'), $this->owner);
    $b = $this->sm->returnForChanges($b, $this->staff, 'Please re-upload the certificate.');
    Carbon::setTestNow(now()->addDays(2));

    $b = $this->sm->submit($b->fresh(), $this->owner);

    expect($b->status)->toBe(BookingStatus::Submitted)
        ->and($b->appointmentDateString())->toBe('2026-11-17')
        ->and($b->appointment_start)->toBe('10:00');
});

test('a returned booking moved to a new date is checked against lead time again', function () {
    $b = $this->sm->submit(draftFor($this->owner, 'confirmation', 'confirmation/valid-basic', '2026-11-17', '10:00'), $this->owner);
    $b = $this->sm->returnForChanges($b, $this->staff, 'Please re-upload the certificate.');
    Carbon::setTestNow(now()->addDays(2));
    $b->update(['appointment_date' => '2026-11-12', 'appointment_start' => '10:00']);

    expect(fn () => $this->sm->submit($b->fresh(), $this->owner))
        ->toThrow(BookingRuleViolation::class, 'must be booked at least 14 days ahead')
        ->and($b->fresh()->status)->toBe(BookingStatus::Returned);
});

test('a returned booking moved to a new time on the same date is fully re-checked', function () {
    $b = $this->sm->submit(draftFor($this->owner, 'confirmation', 'confirmation/valid-basic', '2026-11-17', '10:00'), $this->owner);
    $b = $this->sm->returnForChanges($b, $this->staff, 'Please re-upload the certificate.');
    Carbon::setTestNow(now()->addDays(2));
    $b->update(['appointment_start' => '13:00']);

    expect(fn () => $this->sm->submit($b->fresh(), $this->owner))
        ->toThrow(BookingRuleViolation::class, 'must be booked at least 14 days ahead');
});

test('a same-day funeral can be approved later that morning', function () {
    $b = $this->sm->submit(draftFor($this->owner, 'funeral', 'funeral/valid-basic', '2026-11-02', '10:00'), $this->owner);
    Carbon::setTestNow(now()->addMinutes(90)); // 09:30 Manila, inside the one-hour cutoff
    acceptAllDocuments($b);

    expect($this->sm->approve($b, $this->staff)->status)->toBe(BookingStatus::Approved);
});

test('an appointment already in the past cannot be approved', function (int $minutesLater, string $message) {
    $b = $this->sm->submit(draftFor($this->owner, 'funeral', 'funeral/valid-basic', '2026-11-02', '10:00'), $this->owner);
    Carbon::setTestNow(now()->addMinutes($minutesLater));
    acceptAllDocuments($b);

    expect(fn () => $this->sm->approve($b, $this->staff))
        ->toThrow(BookingRuleViolation::class, $message)
        ->and($b->fresh()->status)->toBe(BookingStatus::Submitted);
})->with([
    'later the same day' => [150, 'Cannot approve: That time is no longer available.'],
    'the next day' => [60 * 24, 'Cannot approve: That date has already passed.'],
]);

test('approval still refuses a held slot that a blackout now covers', function () {
    $b = $this->sm->submit(draftFor($this->owner, 'confirmation', 'confirmation/valid-basic', '2026-11-17', '10:00'), $this->owner);
    App\Models\BlackoutDate::create(['date' => '2026-11-17', 'reason' => 'Parish fiesta']);
    Carbon::setTestNow(now()->addDays(2));
    acceptAllDocuments($b);

    expect(fn () => $this->sm->approve($b, $this->staff))->toThrow(BookingRuleViolation::class, 'Cannot approve: Unavailable');
});

test('rescheduling an emergency anointing to a real date clears the emergency flag', function () {
    $this->owner->update(['phone' => '09171234567']);
    $draft = draftFor($this->owner, 'anointing', 'anointing/valid-hospital', null, null);
    $draft->update(['form_data' => array_merge($draft->form_data, ['inDangerOfDeath' => true])]);
    $b = $this->sm->submit($draft, $this->owner);
    expect($b->is_emergency)->toBeTrue();

    $b = $this->sm->reschedule($b, $this->owner, '2026-11-04', '10:00');

    expect($b->is_emergency)->toBeFalse()->and($b->appointmentDateString())->toBe('2026-11-04');
});

test('resubmitting a booking with a refund due is refused and keeps the refund flag', function () {
    $b = $this->sm->submit(draftFor($this->owner, 'wedding', 'wedding/valid-basic', '2027-02-02', '09:30'), $this->owner);
    $this->sm->recordPayment($b, 'cs_1', 'pay_1', 100000, 'evt_1'); // underpaid
    expect($b->fresh()->payment_status)->toBe(PaymentStatus::RefundDue);
    $b = $this->sm->returnForChanges($b->fresh(), $this->staff, 'Fix the names.');

    expect(fn () => $this->sm->submit($b->fresh(), $this->owner))
        ->toThrow(BookingRuleViolation::class, 'The parish office is processing a refund for this booking. You can resubmit once it is done.');

    expect($b->fresh()->status)->toBe(BookingStatus::Returned)
        ->and($b->fresh()->payment_status)->toBe(PaymentStatus::RefundDue);
});
