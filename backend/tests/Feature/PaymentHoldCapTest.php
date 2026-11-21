<?php

use App\Models\AuditLog;
use App\Models\Booking;
use App\Models\Service;
use App\Models\User;
use App\Services\Booking\BookingStateMachine;
use Database\Seeders\ParishSettingSeeder;
use Database\Seeders\ServiceSeeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Storage;

beforeEach(function () {
    $this->seed(ServiceSeeder::class);
    $this->seed(ParishSettingSeeder::class);
    Storage::fake('local');
    // Mon 2026-11-02 14:00 in Manila
    Carbon::setTestNow(Carbon::parse('2026-11-02 14:00', 'Asia/Manila'));
    $this->sm = app(BookingStateMachine::class);
    $this->staff = User::factory()->create(['role' => 'staff']);
});

afterEach(fn () => Carbon::setTestNow());

/** A priced wedding the office submits at the counter with lead time waived. */
function counterWedding(User $staff, string $date, string $start): Booking
{
    $draft = Booking::factory()->walkIn($staff)->create([
        'sacrament' => 'wedding', 'status' => 'draft',
        'form_data' => formDataFixture('wedding/valid-basic', $staff->id),
        'appointment_date' => $date, 'appointment_start' => $start,
    ]);

    return app(BookingStateMachine::class)->submit($draft, $staff, true, 'Counter booking');
}

function manila(string $when): Carbon
{
    return Carbon::parse($when, 'Asia/Manila');
}

test('appointmentStartsAt is the parish-time start as an instant, null without an appointment', function () {
    $b = Booking::factory()->scheduled('2026-11-03', '10:00', '11:00')->make();
    expect($b->appointmentStartsAt()->equalTo(manila('2026-11-03 10:00')))->toBeTrue()
        ->and(Booking::factory()->make()->appointmentStartsAt())->toBeNull();
});

test('a hold for an appointment five days out is 48 hours', function () {
    $b = counterWedding($this->staff, '2026-11-07', '10:00');

    expect($b->payment_hold_expires_at->equalTo(now()->addHours(48)))->toBeTrue();
});

test('a hold for an appointment 20 hours out ends at the appointment start', function () {
    $b = counterWedding($this->staff, '2026-11-03', '10:00');

    expect($b->payment_hold_expires_at->equalTo(manila('2026-11-03 10:00')))->toBeTrue();
});

test('a hold for an appointment 10 minutes out is one hour', function () {
    Carbon::setTestNow(manila('2026-11-03 09:50'));
    $b = counterWedding($this->staff, '2026-11-03', '10:00');

    expect($b->payment_hold_expires_at->equalTo(now()->addHour()))->toBeTrue();
});

test('an emergency anointing with a fee keeps the 48 hour hold', function () {
    Service::where('id', 'anointing')->update(['fee_rule' => 'flat', 'price_centavos' => 100000]);
    $draft = Booking::factory()->walkIn($this->staff)->create([
        'sacrament' => 'anointing', 'status' => 'draft', 'form_data' => formDataFixture('anointing/valid-hospital', $this->staff->id),
    ]);
    $draft->update(['form_data' => array_merge($draft->form_data, ['inDangerOfDeath' => true])]);

    $b = $this->sm->submit($draft->fresh(), $this->staff);

    expect($b->is_emergency)->toBeTrue()->and($b->payment_hold_expires_at->equalTo(now()->addHours(48)))->toBeTrue();
});

test('a refund that reopens payment applies the same cap', function () {
    $b = Booking::factory()->scheduled('2026-11-03', '10:00', '11:30')->create([
        'user_id' => User::factory()->create()->id, 'sacrament' => 'wedding', 'status' => 'submitted', 'payment_status' => 'refund_due',
        'amount_due_centavos' => 500000, 'amount_paid_centavos' => 500000, 'paymongo_payment_id' => 'pay_x', 'payment_hold_expires_at' => null,
    ]);

    $this->sm->markRefunded($b, $this->staff, 'PM-REF-1');

    expect($b->fresh()->payment_hold_expires_at->equalTo(manila('2026-11-03 10:00')))->toBeTrue();
});

test('a refund reopened after the appointment start gives one hour and does not throw', function () {
    $b = Booking::factory()->scheduled('2026-11-02', '10:00', '11:30')->create([
        'user_id' => User::factory()->create()->id, 'sacrament' => 'wedding', 'status' => 'submitted', 'payment_status' => 'refund_due',
        'amount_due_centavos' => 500000, 'amount_paid_centavos' => 500000, 'paymongo_payment_id' => 'pay_x', 'payment_hold_expires_at' => null,
    ]);

    $this->sm->markRefunded($b, $this->staff, 'PM-REF-2');

    $fresh = $b->fresh();
    expect($fresh->payment_hold_expires_at->equalTo(now()->addHour()))->toBeTrue();
    // The notification states the real deadline in parish time.
    expect(\App\Models\AppNotification::where('user_id', $b->user_id)->latest('id')->value('body'))
        ->toContain('Please pay again by Nov 2, 3:00 PM')->not->toContain('48 hours');
});

test('a reschedule to an earlier date shortens the hold and to a later date never lengthens it', function () {
    $owner = User::factory()->create();
    $b = Booking::factory()->scheduled('2026-12-01', '10:00', '11:30')->create([
        'user_id' => $owner->id, 'sacrament' => 'wedding', 'status' => 'submitted', 'payment_status' => 'unpaid',
        'amount_due_centavos' => 500000, 'payment_hold_expires_at' => now()->addHours(30),
        'form_data' => formDataFixture('wedding/valid-basic', $owner->id),
    ]);

    $this->sm->rescheduleByStaff($b, $this->staff, '2026-11-03', '10:00', 'Family asked', true); // starts in 20 h
    expect($b->fresh()->payment_hold_expires_at->equalTo(manila('2026-11-03 10:00')))->toBeTrue();

    $this->sm->rescheduleByStaff($b->fresh(), $this->staff, '2026-11-10', '10:00', 'Moved back', true);
    expect($b->fresh()->payment_hold_expires_at->equalTo(manila('2026-11-03 10:00')))->toBeTrue();
});

test('an owner reschedule keeps a shorter existing hold', function () {
    $owner = User::factory()->create();
    $b = Booking::factory()->scheduled('2027-02-02', '10:00', '11:30')->create([
        'user_id' => $owner->id, 'sacrament' => 'wedding', 'status' => 'submitted', 'payment_status' => 'unpaid',
        'amount_due_centavos' => 500000, 'payment_hold_expires_at' => now()->addHours(30),
        'form_data' => formDataFixture('wedding/valid-basic', $owner->id),
    ]);

    $this->sm->reschedule($b, $owner, '2027-02-03', '10:00');

    expect($b->fresh()->payment_hold_expires_at->equalTo(now()->addHours(30)))->toBeTrue();
});

test('the expiry job cancels a capped hold at its deadline', function () {
    $b = counterWedding($this->staff, '2026-11-03', '10:00');
    $this->artisan('bookings:expire-holds')->assertSuccessful();
    expect($b->fresh()->status->value)->toBe('submitted');

    Carbon::setTestNow(manila('2026-11-03 10:01'));
    $this->artisan('bookings:expire-holds')->assertSuccessful();

    expect($b->fresh()->status->value)->toBe('cancelled')
        ->and($b->fresh()->status_reason)->toStartWith('Payment not completed');
});

// ---- 3b: a returned booking's hold also ends at the appointment start ----------------------

function returnedBooking(string $date, string $start): Booking
{
    $b = Booking::factory()->scheduled($date, $start, '11:00')->create([
        'user_id' => User::factory()->create()->id, 'sacrament' => 'funeral', 'status' => 'returned', 'returned_at' => now(),
    ]);
    AuditLog::create([
        'actor_user_id' => null, 'action' => 'booking.returned', 'subject_type' => 'booking', 'subject_id' => $b->id,
        'metadata' => ['appointmentDate' => $date, 'appointmentStart' => $start], 'created_at' => now(),
    ]);

    return $b->fresh();
}

test('a returned booking holds its slot until the appointment start, then heldSlot is null and the job cancels it', function () {
    $b = returnedBooking('2026-11-03', '10:00');
    expect($b->heldSlot())->toBe(['date' => '2026-11-03', 'start' => '10:00']);

    Carbon::setTestNow(manila('2026-11-03 10:01'));
    expect($b->fresh()->heldSlot())->toBeNull();

    $this->artisan('bookings:expire-holds')->assertSuccessful();
    expect($b->fresh()->status->value)->toBe('cancelled')
        ->and($b->fresh()->status_reason)->toStartWith('Not resubmitted');
});

test('a returned booking before its appointment start is left alone', function () {
    $b = returnedBooking('2026-11-03', '10:00');

    $this->artisan('bookings:expire-holds')->assertSuccessful();

    expect($b->fresh()->status->value)->toBe('returned');
});
