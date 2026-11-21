<?php

use App\Mail\BookingMail;
use App\Models\AppNotification;
use App\Models\Booking;
use App\Models\CertificateRequest;
use App\Models\RegisterEntry;
use App\Models\User;
use App\Services\Booking\BookingNotifier;
use App\Services\Booking\BookingStateMachine;
use Database\Seeders\ParishSettingSeeder;
use Database\Seeders\ServiceSeeder;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\Mailer\Transport\AbstractTransport;

beforeEach(function () {
    $this->seed(ServiceSeeder::class);
    $this->seed(ParishSettingSeeder::class);
    Carbon::setTestNow(Carbon::parse('2026-11-02 00:00:00', 'UTC')); // Mon 08:00 in Manila
    Storage::fake('local');
    config(['app.parishioner_url' => 'https://parish.test']);
    $this->owner = User::factory()->create(['role' => 'parishioner', 'full_name' => 'Rita Reyes', 'email' => 'rita@gmail.com']);
    $this->staff = User::factory()->create(['role' => 'staff', 'full_name' => 'Sam Staff', 'email' => 'sam@gmail.com']);
    $this->machine = app(BookingStateMachine::class);
});
afterEach(fn () => Carbon::setTestNow());

/** A house blessing (no documents, no fee) in the given state; the simplest booking the machine will move. */
function mailBlessing(array $over = [], string $date = '2026-11-10'): Booking
{
    return Booking::factory()->scheduled($date, '10:00', '10:45')->create($over + [
        'user_id' => test()->owner->id, 'sacrament' => 'house-blessing', 'status' => 'submitted', 'payment_status' => 'not_required',
        'is_offsite' => true, 'form_data' => ['propertyType' => 'house', 'propertyOwner' => 'A'],
    ]);
}

function mailSubjects(): array
{
    return Mail::queued(BookingMail::class)->map(fn (BookingMail $m) => $m->envelope()->subject)->all();
}

// ---- Which events mail -----------------------------------------------------------------------

test('each status event queues exactly one email to the owner with the reference in the subject', function (string $name, Closure $act, string $title) {
    Mail::fake();

    $booking = $act($this);

    Mail::assertQueued(BookingMail::class, 1);
    Mail::assertQueued(BookingMail::class, fn (BookingMail $m) => $m->hasTo('rita@gmail.com')
        && str_contains($m->envelope()->subject, $title)
        && str_contains($m->envelope()->subject, $booking->reference_number));
})->with([
    'returned' => ['returned', fn ($t) => tap(mailBlessing(), fn ($b) => $t->machine->returnForChanges($b, $t->staff, 'Add the lot number')), 'Booking needs changes'],
    'approved' => ['approved', fn ($t) => tap(mailBlessing(), fn ($b) => $t->machine->approve($b, $t->staff)), 'Booking Approved'],
    'declined' => ['declined', fn ($t) => tap(mailBlessing(), fn ($b) => $t->machine->decline($b, $t->staff, 'Not available')), 'Booking Declined'],
    'cancelled by the office' => ['cancelled', fn ($t) => tap(mailBlessing(), fn ($b) => $t->machine->cancel($b, $t->staff, 'Priest unavailable')), 'Booking Cancelled'],
    'payment confirmed' => ['payment', fn ($t) => tap(mailBlessing(['payment_status' => 'unpaid', 'amount_due_centavos' => 50000]), fn ($b) => $t->machine->recordPayment($b, 'cs_1', 'pay_1', 50000, 'evt_1')), 'Payment Received'],
    'full refund' => ['refund', fn ($t) => tap(mailBlessing(['status' => 'cancelled', 'payment_status' => 'refund_due', 'amount_due_centavos' => 50000, 'amount_paid_centavos' => 50000]), fn ($b) => $t->machine->markRefunded($b, $t->staff, 'REF-1')), 'Refund processed'],
    'partial refund' => ['partial', fn ($t) => tap(mailBlessing(['payment_status' => 'paid', 'amount_due_centavos' => 50000, 'amount_paid_centavos' => 80000]), fn ($b) => $t->machine->recordPartialRefund($b, $t->staff, 'REF-2', 30000)), 'Partial refund processed'],
    'rescheduled by the office' => ['moved', fn ($t) => tap(mailBlessing(), fn ($b) => $t->machine->rescheduleByStaff($b, $t->staff, '2026-11-12', '14:00', 'Family asked')), 'Booking Rescheduled'],
    'completed' => ['completed', fn ($t) => tap(mailBlessing(['status' => 'approved'], '2026-11-02'), fn ($b) => $t->machine->complete($b, $t->staff)), 'Sacrament recorded'],
]);

test('a late document that is not accepted is emailed to the owner', function () {
    Mail::fake();
    $booking = Booking::factory()->scheduled('2027-03-06', '10:00', '11:30')->create([
        'user_id' => $this->owner->id, 'sacrament' => 'wedding', 'status' => 'approved', 'payment_status' => 'paid', 'amount_due_centavos' => 500000,
        'form_data' => formDataFixture('wedding/valid-basic', $this->owner->id) + ['bannsCertificate' => '/documents/'.$this->owner->id.'/banns.pdf'],
    ]);
    Storage::disk('local')->put("documents/{$this->owner->id}/banns.pdf", 'x');

    $this->actingAs($this->staff)->putJson("/api/admin/bookings/{$booking->id}/documents/bannsCertificate", ['status' => 'rejected', 'note' => 'Wrong paper'])->assertOk();

    Mail::assertQueued(BookingMail::class, 1);
    Mail::assertQueued(BookingMail::class, fn (BookingMail $m) => $m->hasTo('rita@gmail.com') && str_contains($m->envelope()->subject, $booking->reference_number));
});

test('a certificate request issued or declined is emailed, with a link to the wallet', function () {
    Mail::fake();
    $admin = User::factory()->create(['role' => 'admin']);
    $entry = RegisterEntry::factory()->create(['sacrament' => 'baptism', 'booking_id' => null, 'source' => 'transcribed']);
    $issued = CertificateRequest::factory()->create(['user_id' => $this->owner->id, 'sacrament' => 'baptism']);
    $declined = CertificateRequest::factory()->create(['user_id' => $this->owner->id, 'sacrament' => 'baptism']);

    $this->actingAs($admin)->postJson("/api/admin/certificate-requests/{$issued->id}/issue", ['registerEntryId' => $entry->id])->assertOk();
    $this->actingAs($admin)->postJson("/api/admin/certificate-requests/{$declined->id}/decline", ['reason' => 'Cannot match the ID'])->assertOk();

    Mail::assertQueued(BookingMail::class, 2);
    Mail::assertQueued(BookingMail::class, fn (BookingMail $m) => $m->hasTo('rita@gmail.com') && $m->actionUrl === 'https://parish.test/wallet'
        && str_contains($m->envelope()->subject, $issued->reference_number));
    Mail::assertQueued(BookingMail::class, fn (BookingMail $m) => str_contains($m->envelope()->subject, $declined->reference_number));
});

test('what the person just did themselves, and every staff alert, queue no email', function () {
    Mail::fake();
    $booking = mailBlessing(['payment_status' => 'paid', 'amount_due_centavos' => 50000, 'amount_paid_centavos' => 50000, 'status' => 'approved']);

    $this->machine->reschedule($booking, $this->owner, '2026-11-12', '14:00'); // approved: also alerts staff
    $this->machine->cancel($booking->fresh(), $this->owner, 'Changed my mind');  // paid: also alerts staff

    expect(AppNotification::where('user_id', $this->staff->id)->count())->toBeGreaterThan(0);
    Mail::assertNothingQueued();
});

test('the action link is the booking page', function () {
    Mail::fake();
    $booking = mailBlessing();

    $this->machine->approve($booking, $this->staff);

    Mail::assertQueued(BookingMail::class, fn (BookingMail $m) => $m->actionUrl === "https://parish.test/booking/history/{$booking->id}" && $m->actionLabel === 'View booking');
    $done = mailBlessing(['status' => 'approved'], '2026-11-02');
    $this->machine->complete($done, $this->staff);
    Mail::assertQueued(BookingMail::class, fn (BookingMail $m) => $m->actionUrl === "https://parish.test/booking/history/{$done->id}" && $m->actionLabel === 'View certificate');
});

// ---- Who is mailed ----------------------------------------------------------------------------

test('a walk-in with an email in the snapshot is mailed, with no button unless the entry is verifiable', function () {
    Mail::fake();
    $booking = mailBlessing(['user_id' => null, 'channel' => 'walk_in', 'created_by' => $this->staff->id, 'owner_snapshot' => ['fullName' => 'Maria Cruz', 'email' => 'maria@gmail.com']]);

    $this->machine->approve($booking, $this->staff);

    Mail::assertQueued(BookingMail::class, fn (BookingMail $m) => $m->hasTo('maria@gmail.com') && $m->greetingName === 'Maria' && $m->actionUrl === null && $m->actionLabel === null);
});

test('a walk-in whose completed entry is verifiable gets a link to the verify page', function () {
    Mail::fake();
    $booking = Booking::factory()->scheduled('2026-11-02', '10:00', '10:45')->create([
        'user_id' => null, 'channel' => 'walk_in', 'created_by' => $this->staff->id, 'owner_snapshot' => ['fullName' => 'Maria Cruz', 'email' => 'maria@gmail.com'],
        'sacrament' => 'funeral', 'status' => 'approved', 'payment_status' => 'not_required', 'form_data' => formDataFixture('funeral/valid-basic', $this->staff->id),
    ]);

    $this->machine->complete($booking, $this->staff);

    $entry = RegisterEntry::where('booking_id', $booking->id)->sole();
    Mail::assertQueued(BookingMail::class, fn (BookingMail $m) => $m->hasTo('maria@gmail.com')
        && $m->actionUrl === ($entry->verify_code !== null ? 'https://parish.test/verify' : null));
});

test('a walk-in with no email or an invalid one is not mailed and the action still succeeds', function (?string $email) {
    Mail::fake();
    $booking = mailBlessing(['user_id' => null, 'channel' => 'walk_in', 'created_by' => $this->staff->id, 'owner_snapshot' => ['fullName' => 'Maria Cruz', 'email' => $email]]);

    $this->machine->approve($booking, $this->staff);

    expect($booking->fresh()->status->value)->toBe('approved');
    Mail::assertNothingQueued();
})->with([null, '', 'maria at gmail', 'maria@']);

test('a booking whose account was deleted is never mailed', function () {
    Mail::fake();
    $booking = mailBlessing(['user_id' => null, 'owner_snapshot' => ['fullName' => 'Rita Reyes', 'email' => 'rita@gmail.com', 'accountDeleted' => true]]);

    $this->machine->approve($booking, $this->staff);

    Mail::assertNothingQueued();
});

test('deleting an account marks its bookings accountDeleted, so nothing more is mailed', function () {
    Mail::fake();
    $this->owner->update(['password' => bcrypt('secret-pass-1')]);
    $booking = mailBlessing();
    $walkIn = mailBlessing(['channel' => 'walk_in', 'created_by' => $this->staff->id, 'owner_snapshot' => ['fullName' => 'Rita Reyes', 'phone' => '0917', 'email' => 'rita@gmail.com']], '2026-11-11');

    $this->actingAs($this->owner)->deleteJson('/api/me', ['currentPassword' => 'secret-pass-1'])->assertNoContent();

    expect($booking->fresh()->owner_snapshot['accountDeleted'])->toBeTrue()->and($walkIn->fresh()->owner_snapshot)->toMatchArray(['accountDeleted' => true, 'phone' => '0917']);
    $this->machine->approve($booking->fresh(), $this->staff);
    $this->machine->approve($walkIn->fresh(), $this->staff);
    Mail::assertNothingQueued();
});

test('an address at example.com is never mailed, whatever the case', function (string $email) {
    Mail::fake();
    $this->owner->update(['email' => $email]);

    $this->machine->approve(mailBlessing(), $this->staff);

    Mail::assertNothingQueued();
})->with(['demo@example.com', 'Demo@Example.COM']);

test('mailAddressFor answers the account address, the walk-in address or null', function () {
    $notify = app(BookingNotifier::class);

    expect($notify->mailAddressFor(mailBlessing()))->toBe('rita@gmail.com')
        ->and($notify->mailAddressFor(mailBlessing(['user_id' => null, 'owner_snapshot' => ['email' => 'maria@gmail.com']])))->toBe('maria@gmail.com')
        ->and($notify->mailAddressFor(mailBlessing(['user_id' => null, 'owner_snapshot' => ['email' => 'x@example.com']])))->toBeNull()
        ->and($notify->mailAddressFor(mailBlessing(['user_id' => null, 'owner_snapshot' => ['email' => 'maria@gmail.com', 'accountDeleted' => true]])))->toBeNull()
        ->and($notify->mailAddressFor(mailBlessing(['user_id' => null])))->toBeNull();
});

// ---- Mail never breaks an action ---------------------------------------------------------------

test('an email is queued only once the transaction commits: a rollback sends nothing', function () {
    $sent = fn () => Mail::mailer('array')->getSymfonyTransport()->messages()->count();
    $booking = mailBlessing();

    try {
        DB::transaction(function () use ($booking) {
            $this->machine->approve($booking, $this->staff); // writes the notification and asks for the mail
            throw new RuntimeException('something later in the action failed');
        });
    } catch (RuntimeException) {
    }
    expect($sent())->toBe(0)->and($booking->fresh()->status->value)->toBe('submitted');

    $this->machine->approve($booking->fresh(), $this->staff); // the control: committed, it is sent (QUEUE_CONNECTION=sync here)
    expect($sent())->toBe(1);
});

test('an exception while queuing is logged and the action still succeeds', function () {
    Mail::shouldReceive('to')->andThrow(new RuntimeException('queue is down'));
    Log::spy();
    $booking = mailBlessing();

    $this->machine->approve($booking, $this->staff);

    expect($booking->fresh()->status->value)->toBe('approved')->and(AppNotification::where('user_id', $this->owner->id)->count())->toBe(1);
    Log::shouldHaveReceived('warning')->once();
});

test('a queue push that throws after the commit leaves the request successful and is logged', function () {
    // The database queue defers its push to the commit, which is where a failure used to surface as a 500.
    config(['queue.default' => 'database']);
    Schema::drop('jobs');
    Log::spy();
    $booking = mailBlessing();

    $this->actingAs($this->staff)->patchJson("/api/admin/bookings/{$booking->id}/approve")->assertOk()->assertJsonPath('status', 'approved');

    expect($booking->fresh()->status->value)->toBe('approved')->and(AppNotification::where('user_id', $this->owner->id)->count())->toBe(1);
    Log::shouldHaveReceived('warning')->withArgs(fn ($message) => str_contains($message, 'Could not queue a status email'))->once();
});

test('a mail job whose mailer throws is released for retry and never reaches the request', function () {
    config(['queue.default' => 'database', 'mail.default' => 'boom', 'mail.mailers.boom' => ['transport' => 'boom']]);
    Mail::extend('boom', fn () => new class extends AbstractTransport
    {
        protected function doSend(\Symfony\Component\Mailer\SentMessage $message): void
        {
            throw new RuntimeException('mail server is down');
        }

        public function __toString(): string
        {
            return 'boom';
        }
    });
    $booking = mailBlessing();

    $this->actingAs($this->staff)->patchJson("/api/admin/bookings/{$booking->id}/approve")->assertOk()->assertJsonPath('status', 'approved');
    expect(DB::table('jobs')->count())->toBe(1);

    Artisan::call('queue:work', ['--once' => true, '--tries' => 3]);

    $job = DB::table('jobs')->sole(); // released, not lost and not failed
    expect($job->attempts)->toBe(1)
        ->and(DB::table('failed_jobs')->count())->toBe(0)
        ->and($booking->fresh()->status->value)->toBe('approved');
});

// ---- The mail itself --------------------------------------------------------------------------

test('the mailable is queued and retries three times', function () {
    $mail = new BookingMail('Subject', 'Rita', ['A line'], null, null);

    expect($mail)->toBeInstanceOf(\Illuminate\Contracts\Queue\ShouldQueue::class)
        ->and($mail->tries)->toBe(3);
});

test('the rendered mail names the parish and carries no form data', function () {
    Mail::fake();
    $booking = mailBlessing(['form_data' => ['propertyType' => 'house', 'propertyOwner' => 'ZZ-SECRET-OWNER-ZZ']]);

    $this->machine->approve($booking, $this->staff);

    Mail::assertQueued(BookingMail::class, function (BookingMail $m) {
        $html = $m->render();
        expect($html)->toContain(e(\App\Models\ParishSetting::parishName()))->toContain('Hello Rita')->toContain('View booking')
            ->not->toContain('ZZ-SECRET-OWNER-ZZ');
        expect($m->content()->text)->not->toBeNull();

        return true;
    });
});

test('the plain-text part has the lines and the link', function () {
    $mail = new BookingMail('Subject', 'Rita', ['First line', 'Second line'], 'View booking', 'https://parish.test/booking/history/1');

    $text = view($mail->content()->text, [
        'parishName' => 'St. Test', 'greetingName' => $mail->greetingName, 'lines' => $mail->lines, 'actionLabel' => $mail->actionLabel, 'actionUrl' => $mail->actionUrl,
    ])->render();

    expect($text)->toContain('Hello Rita')->toContain('First line')->toContain('Second line')->toContain('https://parish.test/booking/history/1');
});

// ---- Notifications link to their booking ------------------------------------------------------

test('a booking notification carries booking_id and the API returns bookingId', function () {
    $booking = mailBlessing();
    $this->machine->approve($booking, $this->staff);

    expect(AppNotification::where('user_id', $this->owner->id)->sole()->booking_id)->toBe($booking->id);
    $this->actingAs($this->owner)->getJson('/api/notifications')->assertOk()->assertJsonPath('0.bookingId', $booking->id);
});

test('a notification not about a booking has a null bookingId', function () {
    app(BookingNotifier::class)->user($this->owner, 'Hello', 'Body');

    $this->actingAs($this->owner)->getJson('/api/notifications')->assertOk()->assertJsonPath('0.bookingId', null);
});

// ---- Plumbing ---------------------------------------------------------------------------------

test('the scheduler drains the mail queue every minute', function () {
    $event = collect(app(Schedule::class)->events())->first(fn ($e) => str_contains($e->command, 'queue:work'));

    expect($event)->not->toBeNull()
        ->and($event->expression)->toBe('* * * * *')
        ->and($event->command)->toContain('--stop-when-empty')->toContain('--tries=3')->toContain('--max-time=50')
        ->and($event->withoutOverlapping)->toBeTrue()
        ->and($event->expiresAt)->toBe(5);
});

test('MAIL_MAILER=brevo with a key resolves to the Brevo API transport and sends nothing', function () {
    config(['mail.default' => 'brevo', 'services.brevo.key' => 'xkeysib-fake']);
    Mail::purge('brevo');

    $transport = Mail::mailer('brevo')->getSymfonyTransport();

    expect($transport)->toBeInstanceOf(\Symfony\Component\Mailer\Bridge\Brevo\Transport\BrevoApiTransport::class);
});

test('the Brevo transport talks over an HTTP client that gives up after 10 seconds, 20 in all', function () {
    config(['mail.default' => 'brevo', 'services.brevo.key' => 'xkeysib-fake']);
    Mail::purge('brevo');

    $transport = Mail::mailer('brevo')->getSymfonyTransport();
    $client = (new ReflectionProperty(\Symfony\Component\Mailer\Transport\AbstractHttpTransport::class, 'client'))->getValue($transport);
    $options = (new ReflectionProperty($client, 'defaultOptions'))->getValue($client);

    expect($options['timeout'])->toBe(10.0)->and($options['max_duration'])->toBe(20.0);
});

test('smtp has a ten second timeout', function () {
    expect(config('mail.mailers.smtp.timeout'))->toBe(10);
});

test('every alert to the office about a booking carries that booking, so the bell item opens it', function () {
    $booking = mailBlessing();

    app(BookingNotifier::class)->staff('Refund due', "{$booking->reference_number} was closed after payment.", $booking);
    app(BookingNotifier::class)->staff('General notice', 'Nothing to open.');

    expect(AppNotification::where('user_id', $this->staff->id)->where('title', 'Refund due')->sole()->booking_id)->toBe($booking->id)
        ->and(AppNotification::where('user_id', $this->staff->id)->where('title', 'General notice')->sole()->booking_id)->toBeNull();

    // No call site forgets it: every staff alert in the booking services names the booking.
    foreach (['Services/Booking/BookingStateMachine.php', 'Services/Booking/WeddingMilestones.php', 'Console/Commands/SendReminders.php'] as $file) {
        $source = file_get_contents(app_path($file));
        preg_match_all('/->staff\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*\)/s', $source, $calls);
        expect($calls[0])->not->toBeEmpty();
        foreach ($calls[0] as $call) {
            expect($call)->toMatch('/,\s*\$(b|booking|r\[\'booking\'\])\s*,?\s*\)$/');
        }
    }
});

// The text part is not HTML: "House Blessing & Other" arrived as "House Blessing &amp; Other".
test('the plain-text part is not HTML-escaped', function () {
    $mail = new BookingMail('Subject', "D'Angelo", ['Your House Blessing & Other (HOUS-1) is tomorrow.', 'Staff note: "bring <2> candles"'], 'View booking', 'https://parish.test/b?a=1&b=2');

    $text = view($mail->content()->text, [
        'parishName' => "St. Peter & Paul's", 'greetingName' => $mail->greetingName, 'lines' => $mail->lines, 'actionLabel' => $mail->actionLabel, 'actionUrl' => $mail->actionUrl,
    ])->render();

    expect($text)->toContain('House Blessing & Other')->toContain("Hello D'Angelo,")->toContain('"bring <2> candles"')
        ->toContain('https://parish.test/b?a=1&b=2')->toContain("St. Peter & Paul's")
        ->not->toContain('&amp;')->not->toContain('&#039;')->not->toContain('&quot;')->not->toContain('&lt;');
});

test('a crashed scheduled job frees its lock in minutes, not in the 24 hour default', function () {
    $expires = collect(app(Schedule::class)->events())->mapWithKeys(fn ($e) => [$e->command => [$e->withoutOverlapping, $e->expiresAt]]);
    $of = fn (string $name) => $expires->first(fn ($v, $command) => str_contains($command, $name));

    expect($of('bookings:expire-holds'))->toBe([true, 30])
        ->and($of('bookings:prune-walk-in-drafts'))->toBe([true, 120])
        ->and($of('certificate-requests:prune-files'))->toBe([true, 120]);
});
