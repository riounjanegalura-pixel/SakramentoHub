<?php

use App\Mail\BookingMail;
use App\Models\AppNotification;
use App\Models\Booking;
use App\Models\NotificationPreference;
use App\Models\User;
use Database\Seeders\ParishSettingSeeder;
use Database\Seeders\ServiceSeeder;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;

beforeEach(function () {
    $this->seed(ServiceSeeder::class);
    $this->seed(ParishSettingSeeder::class);
    Storage::fake('local');
    Mail::fake();
    config(['app.parishioner_url' => 'https://parish.test']);
    $this->owner = User::factory()->create(['role' => 'parishioner', 'full_name' => 'Rita Reyes', 'email' => 'rita@gmail.com']);
    $this->staff = User::factory()->create(['role' => 'staff', 'full_name' => 'Sam Staff', 'email' => 'sam@gmail.com']);
    reminderClock('2026-11-02 12:00');
});
afterEach(fn () => Carbon::setTestNow());

/** Moves the clock to a wall-clock time in the parish (Manila). */
function reminderClock(string $manila): void
{
    Carbon::setTestNow(reminderManila($manila));
}

/** A parish wall-clock time as a UTC instant: Eloquent writes a timestamp in the zone it is given, and the columns hold UTC. */
function reminderManila(string $time): Carbon
{
    return Carbon::parse($time, 'Asia/Manila')->utc();
}

/** A baptism the office approved, on the given parish date at 10:00. */
function remindable(string $date, array $over = []): Booking
{
    return Booking::factory()->scheduled($date, '10:00', '10:45')->create($over + [
        'user_id' => test()->owner->id, 'sacrament' => 'baptism', 'status' => 'approved', 'payment_status' => 'paid',
        'amount_due_centavos' => 50000, 'amount_paid_centavos' => 50000, 'paid_at' => now(),
        'form_data' => ['childFirstName' => 'Ana', 'childLastName' => 'Reyes'],
    ]);
}

/** Runs the command and returns the kinds recorded in the ledger, in a stable order. */
function runReminders(): array
{
    test()->artisan('reminders:send')->assertSuccessful();

    return DB::table('sent_reminders')->orderBy('sent_at')->orderBy('kind')->orderBy('subject')->get(['kind', 'subject'])
        ->map(fn ($r) => "{$r->kind}|{$r->subject}")->all();
}

function reminderLedger(string $kind): int
{
    return DB::table('sent_reminders')->where('kind', $kind)->count();
}

function reminderMails(): \Illuminate\Support\Collection
{
    return Mail::queued(BookingMail::class);
}

// ---- appointment_week -------------------------------------------------------------------------

test('the week reminder fires from seven days out to two days out and not before or after', function (string $date, bool $fires) {
    remindable($date);

    runReminders();

    expect(reminderLedger('appointment_week'))->toBe($fires ? 1 : 0);
})->with([
    'eight days out' => ['2026-11-10', false],
    'seven days out' => ['2026-11-09', true],
    'two days out' => ['2026-11-04', true],
    'one day out' => ['2026-11-03', false],
    'today' => ['2026-11-02', false],
]);

test('the week reminder reads the date in the parish, not UTC', function () {
    reminderClock('2026-11-02 00:30'); // still Nov 1 in UTC
    remindable('2026-11-09');

    runReminders();

    expect(reminderLedger('appointment_week'))->toBe(1);
});

test('the week reminder wording, notification and email', function () {
    $booking = remindable('2026-11-06');

    runReminders();

    $note = AppNotification::where('user_id', $this->owner->id)->where('title', 'Appointment this week')->first();
    expect($note->booking_id)->toBe($booking->id)
        ->and($note->body)->toBe("Your Baptism ({$booking->reference_number}) is on Friday, Nov 6 at 10:00 AM at St. Peter the Apostle Parish.");
    Mail::assertQueued(BookingMail::class, 1);
    Mail::assertQueued(BookingMail::class, fn (BookingMail $m) => $m->hasTo('rita@gmail.com')
        && $m->envelope()->subject === "Reminder: your Baptism on Nov 6 ({$booking->reference_number})"
        && $m->greetingName === 'Rita'
        && $m->lines === [$note->body]
        && $m->actionUrl === "https://parish.test/booking/history/{$booking->id}");
});

// ---- appointment_tomorrow ---------------------------------------------------------------------

test('the tomorrow reminder opens at 08:00 the day before and closes at the appointment start', function (string $now, bool $fires) {
    reminderClock($now);
    remindable('2026-11-03'); // 10:00

    runReminders();

    expect(reminderLedger('appointment_tomorrow'))->toBe($fires ? 1 : 0);
})->with([
    'the day before at 07:59' => ['2026-11-02 07:59', false],
    'the day before at 08:00' => ['2026-11-02 08:00', true],
    'the morning of, before the start' => ['2026-11-03 09:59', true],
    'at the start' => ['2026-11-03 10:00', false],
    'one minute after the start' => ['2026-11-03 10:01', false],
]);

test('the tomorrow reminder wording', function () {
    $booking = remindable('2026-11-03');

    runReminders();

    $note = AppNotification::where('user_id', $this->owner->id)->where('title', 'Appointment tomorrow')->first();
    expect($note->body)->toBe("Your Baptism ({$booking->reference_number}) is tomorrow, Nov 3 at 10:00 AM at St. Peter the Apostle Parish. Show your day pass at the office.");
    Mail::assertQueued(BookingMail::class, fn (BookingMail $m) => $m->envelope()->subject === "Reminder: your Baptism is tomorrow ({$booking->reference_number})");
});

test('a run after a long gap still sends tomorrow while the appointment has not started, and never after', function () {
    $booking = remindable('2026-11-03'); // 10:00
    reminderClock('2026-11-03 09:00'); // the scheduler slept since the day before

    runReminders();
    $note = AppNotification::where('user_id', $this->owner->id)->where('title', 'Appointment tomorrow')->first();
    expect(reminderLedger('appointment_tomorrow'))->toBe(1)
        ->and($note->body)->toBe("Your Baptism ({$booking->reference_number}) is today, Nov 3 at 10:00 AM at St. Peter the Apostle Parish. Show your day pass at the office.");

    DB::table('sent_reminders')->delete();
    reminderClock('2026-11-03 10:30');
    runReminders();
    expect(reminderLedger('appointment_tomorrow'))->toBe(0)->and(reminderLedger('appointment_week'))->toBe(0);
});

test('a second run sends nothing', function () {
    remindable('2026-11-03');

    $first = runReminders();
    $notes = AppNotification::count();
    $mails = reminderMails()->count();
    $second = runReminders();

    expect($first)->not->toBeEmpty()
        ->and($second)->toBe($first)
        ->and(AppNotification::count())->toBe($notes)
        ->and(reminderMails()->count())->toBe($mails);
});

test('a reminder already in the ledger is not sent again, whoever races to send it', function () {
    $booking = remindable('2026-11-03');
    DB::table('sent_reminders')->insert(['booking_id' => $booking->id, 'kind' => 'appointment_tomorrow', 'subject' => '2026-11-03', 'sent_at' => now()]);

    runReminders();

    expect(AppNotification::where('title', 'Appointment tomorrow')->count())->toBe(0);
});

test('a booking moved after its reminder is reminded again for the new date, once', function () {
    $booking = remindable('2026-11-06');
    runReminders();
    expect(reminderLedger('appointment_week'))->toBe(1);

    $booking->update(['appointment_date' => '2026-11-08']);
    runReminders();
    runReminders();

    expect(DB::table('sent_reminders')->where('kind', 'appointment_week')->orderBy('subject')->pluck('subject')->all())->toBe(['2026-11-06', '2026-11-08'])
        ->and(AppNotification::where('title', 'Appointment this week')->count())->toBe(2);
});

// ---- the owner: account, preference, walk-in -------------------------------------------------

test('with booking reminders off the notification is written and no email is queued', function () {
    NotificationPreference::create(['user_id' => $this->owner->id, 'booking_reminders' => false]);
    remindable('2026-11-06');

    runReminders();

    expect(AppNotification::where('user_id', $this->owner->id)->where('title', 'Appointment this week')->count())->toBe(1);
    Mail::assertNothingQueued();
});

test('with no preference row the reminder is mailed', function () {
    remindable('2026-11-06');

    runReminders();

    Mail::assertQueued(BookingMail::class, 1);
});

test('a walk-in with an email is mailed without a button', function () {
    remindable('2026-11-06', ['user_id' => null, 'channel' => 'walk_in', 'owner_snapshot' => ['fullName' => 'Walter Walkin', 'email' => 'walter@gmail.com']]);

    runReminders();

    expect(AppNotification::count())->toBe(0);
    Mail::assertQueued(BookingMail::class, 1);
    Mail::assertQueued(BookingMail::class, fn (BookingMail $m) => $m->hasTo('walter@gmail.com') && $m->greetingName === 'Walter' && $m->actionUrl === null && $m->actionLabel === null);
});

test('a walk-in without an email, or whose account was deleted, gets nothing and nothing breaks', function (?array $snapshot) {
    $booking = remindable('2026-11-06', ['user_id' => null, 'channel' => 'walk_in', 'owner_snapshot' => $snapshot]);

    runReminders();

    expect(AppNotification::count())->toBe(0)->and(reminderLedger('appointment_week'))->toBe(1);
    Mail::assertNothingQueued();
})->with([
    'no snapshot' => [null],
    'a name only' => [['fullName' => 'Walter Walkin']],
    'a bad address' => [['fullName' => 'Walter Walkin', 'email' => 'not-an-address']],
    'an account that was deleted' => [['fullName' => 'Walter Walkin', 'email' => 'walter@gmail.com', 'accountDeleted' => true]],
]);

test('an address at example.com is never mailed', function () {
    $demo = User::factory()->create(['role' => 'parishioner', 'email' => 'test@example.com']);
    remindable('2026-11-06', ['user_id' => $demo->id]);

    runReminders();

    expect(AppNotification::where('user_id', $demo->id)->count())->toBe(1);
    Mail::assertNothingQueued();
});

test('bookings that are not live are never reminded', function (string $status, string $payment) {
    remindable('2026-11-03', ['status' => $status, 'payment_status' => $payment]);
    remindable('2026-11-06', ['status' => $status, 'payment_status' => $payment]);

    runReminders();

    expect(DB::table('sent_reminders')->count())->toBe(0);
    Mail::assertNothingQueued();
})->with([
    'cancelled' => ['cancelled', 'void'],
    'declined' => ['declined', 'void'],
    'completed' => ['completed', 'paid'],
    'draft' => ['draft', 'unpaid'],
    'submitted and not yet approved' => ['submitted', 'paid'],
]);

test('an emergency anointing with no appointment never matches', function () {
    Booking::factory()->create([
        'user_id' => $this->owner->id, 'sacrament' => 'anointing', 'status' => 'approved', 'payment_status' => 'not_required',
        'is_emergency' => true, 'appointment_date' => null, 'appointment_start' => null, 'appointment_end' => null,
        'form_data' => ['patientName' => 'Lola'],
    ]);

    runReminders();

    expect(DB::table('sent_reminders')->count())->toBe(0);
});

// ---- payment_closing --------------------------------------------------------------------------

test('the payment reminder fires only inside the last twelve hours of a hold', function (string $closes, bool $fires) {
    remindable('2026-11-20', ['status' => 'submitted', 'payment_status' => 'unpaid', 'payment_hold_expires_at' => reminderManila($closes)]);

    runReminders();

    expect(reminderLedger('payment_closing'))->toBe($fires ? 1 : 0);
})->with([
    'in eleven hours fifty-nine' => ['2026-11-02 23:59', true],
    'in twelve hours' => ['2026-11-03 00:00', true],
    'in twelve hours and a minute' => ['2026-11-03 00:01', false],
    'in a minute' => ['2026-11-02 12:01', true],
    'right now' => ['2026-11-02 12:00', false],
    'a minute ago' => ['2026-11-02 11:59', false],
]);

test('a paid or approved booking is not told its payment window is closing', function () {
    remindable('2026-11-20', ['status' => 'submitted', 'payment_status' => 'paid', 'payment_hold_expires_at' => now()->addHours(3)]);
    remindable('2026-11-21', ['status' => 'approved', 'payment_status' => 'unpaid', 'payment_hold_expires_at' => now()->addHours(3)]);

    runReminders();

    expect(reminderLedger('payment_closing'))->toBe(0);
});

test('the payment reminder wording, with the hold expiry as its subject', function () {
    reminderClock('2026-11-02 20:00');
    $booking = remindable('2026-11-20', ['status' => 'submitted', 'payment_status' => 'unpaid', 'payment_hold_expires_at' => reminderManila('2026-11-03 07:46')]);

    runReminders();

    $note = AppNotification::where('user_id', $this->owner->id)->where('title', 'Payment closing soon')->first();
    expect($note->body)->toBe("Your payment window for {$booking->reference_number} closes at 7:46 AM tomorrow. Pay by GCash to keep your slot.")
        ->and(DB::table('sent_reminders')->where('kind', 'payment_closing')->value('subject'))->toBe('2026-11-03T07:46');
    Mail::assertQueued(BookingMail::class, fn (BookingMail $m) => $m->envelope()->subject === "Payment window closing ({$booking->reference_number})");

    reminderClock('2026-11-03 06:00');
    $same = remindable('2026-11-21', ['status' => 'submitted', 'payment_status' => 'unpaid', 'payment_hold_expires_at' => reminderManila('2026-11-03 07:46')]);
    runReminders();
    expect(AppNotification::where('body', "Your payment window for {$same->reference_number} closes at 7:46 AM today. Pay by GCash to keep your slot.")->count())->toBe(1);
});

test('a booking waiting for cash is told to bring it to the parish office before the hold ends', function () {
    reminderClock('2026-11-02 20:00');
    $booking = remindable('2026-11-20', ['status' => 'submitted', 'payment_status' => 'pending_cash', 'payment_method' => 'cash', 'payment_hold_expires_at' => reminderManila('2026-11-03 07:46')]);

    runReminders();

    expect(AppNotification::where('user_id', $this->owner->id)->where('title', 'Payment closing soon')->value('body'))
        ->toBe("Your payment window for {$booking->reference_number} closes at 7:46 AM tomorrow. Bring the cash to the parish office before then to keep your slot.");
});

// ---- returned_lapsing -------------------------------------------------------------------------

test('the returned reminder fires in the last two days of the hold', function (string $returnedAt, ?string $date, bool $fires) {
    $over = ['status' => 'returned', 'payment_status' => 'unpaid', 'returned_at' => reminderManila($returnedAt)];
    $date === null ? remindable('2026-12-30', $over) : remindable($date, $over);

    runReminders();

    expect(reminderLedger('returned_lapsing'))->toBe($fires ? 1 : 0);
})->with([
    'five days ago: two days left' => ['2026-10-28 12:00', null, true],
    'five days and a minute ago: just under two days left' => ['2026-10-28 11:59', null, true],
    'four days and 23 hours ago: two days and an hour left' => ['2026-10-28 13:00', null, false],
    'a day ago' => ['2026-11-01 12:00', null, false],
    'seven days ago: the hold ends now' => ['2026-10-26 12:00', null, false],
    'eight days ago: already lapsed' => ['2026-10-25 12:00', null, false],
    'returned yesterday but the appointment is tomorrow' => ['2026-11-01 12:00', '2026-11-03', true],
    'returned yesterday and the appointment is in four days' => ['2026-11-01 12:00', '2026-11-06', false],
    'the appointment has started' => ['2026-11-01 12:00', '2026-11-02', false],
]);

test('the returned reminder wording', function () {
    $booking = remindable('2026-12-30', ['status' => 'returned', 'payment_status' => 'unpaid', 'returned_at' => reminderManila('2026-10-28 10:30')]);

    runReminders();

    $note = AppNotification::where('user_id', $this->owner->id)->where('title', 'Booking will lapse soon')->first();
    expect($note->body)->toBe("Your Baptism ({$booking->reference_number}) was sent back for changes. Update and resubmit it by Nov 4, 10:30 AM or your slot is released.")
        ->and(DB::table('sent_reminders')->where('kind', 'returned_lapsing')->value('subject'))->toBe('2026-10-28T10:30');
    Mail::assertQueued(BookingMail::class, fn (BookingMail $m) => $m->envelope()->subject === "Resubmit your booking soon ({$booking->reference_number})");
});

// ---- wedding_step_overdue ---------------------------------------------------------------------

function overdueWeddingFor(string $date = '2027-03-06', string $status = 'approved'): Booking
{
    $owner = test()->owner;
    $wedding = Booking::factory()->scheduled($date, '10:00', '11:30')->create([
        'user_id' => $owner->id, 'sacrament' => 'wedding', 'status' => $status, 'payment_status' => 'paid',
        'amount_due_centavos' => 500000, 'paid_at' => now(),
        'form_data' => formDataFixture('wedding/valid-basic', $owner->id),
    ]);

    return $wedding;
}

test('an overdue gating step reminds the owner and the staff once per step', function () {
    $wedding = overdueWeddingFor(); // booked Nov 2; the interview is due 2027-01-05
    reminderClock('2027-01-06 09:00');

    runReminders();
    runReminders();

    expect(DB::table('sent_reminders')->where('kind', 'wedding_step_overdue')->pluck('subject')->all())->toBe(['canonical_interview|2027-01-05']);
    $note = AppNotification::where('user_id', $this->owner->id)->where('title', 'Wedding step overdue')->first();
    expect($note->booking_id)->toBe($wedding->id)
        ->and($note->body)->toBe("Your Wedding ({$wedding->reference_number}): Canonical interview was due on Jan 5. Please contact the parish office.")
        ->and(AppNotification::where('user_id', $this->staff->id)->where('title', 'Wedding step overdue')->first()->body)
        ->toBe("{$wedding->reference_number}: Canonical interview was due on Jan 5.");
    // The office's alert opens the booking from the bell, like the owner's.
    expect(AppNotification::where('user_id', $this->staff->id)->where('title', 'Wedding step overdue')->first()->booking_id)->toBe($wedding->id);
    Mail::assertQueued(BookingMail::class, 1);
    Mail::assertQueued(BookingMail::class, fn (BookingMail $m) => $m->envelope()->subject === "Wedding step overdue ({$wedding->reference_number})");

    // The next step to fall overdue is reminded on its own.
    reminderClock('2027-02-05 09:00'); // Pre-Cana was due Feb 4
    runReminders();
    expect(DB::table('sent_reminders')->where('kind', 'wedding_step_overdue')->orderBy('subject')->pluck('subject')->all())->toBe(['canonical_interview|2027-01-05', 'pre_cana|2027-02-04']);
});

test('a step that is overdue again after the wedding was moved is reminded again, once', function () {
    $wedding = overdueWeddingFor(); // the interview is due 2027-01-05
    reminderClock('2027-01-06 09:00');
    runReminders();

    $wedding->update(['appointment_date' => '2027-05-06']); // the interview is now due 2027-03-07
    reminderClock('2027-03-08 09:00');
    runReminders();
    runReminders();

    expect(DB::table('sent_reminders')->where('kind', 'wedding_step_overdue')->where('subject', 'like', 'canonical_interview|%')->orderBy('subject')->pluck('subject')->all())
        ->toBe(['canonical_interview|2027-01-05', 'canonical_interview|2027-03-07'])
        ->and(AppNotification::where('user_id', $this->owner->id)->where('title', 'Wedding step overdue')->where('body', 'like', '%Canonical interview%')->count())->toBe(2);
});

test('a short-notice wedding whose past-due steps are only due is not reminded of them', function () {
    overdueWeddingFor('2026-11-12');
    reminderClock('2026-11-05 09:00');

    runReminders();

    expect(reminderLedger('wedding_step_overdue'))->toBe(0);
});

test('a step that is done, a confession that is only recommended, and a closed wedding are not reminded', function () {
    $wedding = overdueWeddingFor();
    \App\Models\BookingMilestone::create(['booking_id' => $wedding->id, 'key' => 'canonical_interview', 'done_at' => now(), 'done_by' => $this->staff->id]);
    $closed = overdueWeddingFor('2027-03-07', 'cancelled');
    reminderClock('2027-03-04 09:00'); // confession (not gating) is overdue on the first

    runReminders();

    expect(DB::table('sent_reminders')->where('booking_id', $wedding->id)->where('subject', 'canonical_interview')->count())->toBe(0)
        ->and(DB::table('sent_reminders')->where('booking_id', $wedding->id)->where('subject', 'confession')->count())->toBe(0)
        ->and(DB::table('sent_reminders')->where('booking_id', $closed->id)->count())->toBe(0);
});

// ---- plumbing ---------------------------------------------------------------------------------

test('the command prints a count per kind', function () {
    remindable('2026-11-06');

    $this->artisan('reminders:send')
        ->expectsOutputToContain('appointment_week: 1')
        ->expectsOutputToContain('appointment_tomorrow: 0')
        ->assertSuccessful();
});

test('the reminders are scheduled hourly without overlapping', function () {
    $event = collect(app(Schedule::class)->events())->first(fn ($e) => str_contains($e->command, 'reminders:send'));

    expect($event)->not->toBeNull()
        ->and($event->expression)->toBe('0 * * * *')
        ->and($event->withoutOverlapping)->toBeTrue()
        ->and($event->expiresAt)->toBe(60);
});
