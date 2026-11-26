<?php

use App\Models\AppNotification;
use App\Models\AuditLog;
use App\Models\Booking;
use App\Models\BookingDocumentReview;
use App\Models\BookingMilestone;
use App\Models\RegisterEntry;
use App\Models\User;
use App\Services\Booking\WeddingMilestones;
use Database\Seeders\ParishSettingSeeder;
use Database\Seeders\ServiceSeeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Storage;

beforeEach(function () {
    $this->seed(ServiceSeeder::class);
    $this->seed(ParishSettingSeeder::class);
    Carbon::setTestNow(Carbon::parse('2026-11-02 00:00:00', 'UTC')); // Mon 08:00 in Manila
    Storage::fake('local');
    $this->owner = User::factory()->create(['role' => 'parishioner', 'full_name' => 'Rita Reyes']);
    $this->staff = User::factory()->create(['role' => 'staff', 'full_name' => 'Sam Staff']);
    $this->admin = User::factory()->create(['role' => 'admin', 'full_name' => 'Ada Admin']);
});
afterEach(fn () => Carbon::setTestNow());

const WEDDING_DAY = '2027-03-06'; // interview due 2027-01-05, banns asked 01-20, Pre-Cana 02-04, banns done and license 02-20, confession 03-03

/** A wedding from the shared fixture (both Roman Catholic), approved and paid unless told otherwise. */
function wedding(array $over = [], string $date = WEDDING_DAY, array $answers = []): Booking
{
    $owner = test()->owner;

    return Booking::factory()->scheduled($date, '10:00', '11:30')->create($over + [
        'user_id' => $owner->id, 'sacrament' => 'wedding', 'status' => 'approved', 'payment_status' => 'paid',
        'amount_due_centavos' => 500000, 'paid_at' => now(),
        'form_data' => array_merge(formDataFixture('wedding/valid-basic', $owner->id), $answers),
    ]);
}

/** @return array<string, array> the booking's rows keyed by step, as the office sees them */
function steps(Booking $booking): array
{
    return collect(test()->actingAs(test()->staff)->getJson("/api/admin/bookings/{$booking->id}")->assertOk()->json('milestones'))->keyBy('key')->all();
}

function tick(Booking $booking, string $key, array $body = ['done' => true], ?User $as = null)
{
    return test()->actingAs($as ?? test()->staff)->putJson("/api/admin/bookings/{$booking->id}/milestones/{$key}", $body);
}

/** Puts a file in a user's own upload folder and returns its address. */
function uploaded(User $by, string $name): string
{
    Storage::disk('local')->put("documents/{$by->id}/{$name}", 'x');

    return "/documents/{$by->id}/{$name}";
}

function review(Booking $booking, string $key, string $status, ?string $note = null)
{
    return test()->actingAs(test()->staff)->putJson("/api/admin/bookings/{$booking->id}/documents/{$key}", array_filter(['status' => $status, 'note' => $note]));
}

const LICENSE = ['done' => true, 'licenseNumber' => 'ML-2027-00123', 'issuedOn' => '2026-10-30', 'issuedAt' => 'Imus City Civil Registrar'];

// ---- The list ------------------------------------------------------------------------------

test('a Catholic couple has twelve steps, in order, in the documented shape', function () {
    $rows = $this->actingAs($this->staff)->getJson('/api/admin/bookings/'.wedding()->id)->assertOk()->json('milestones');

    expect(array_column($rows, 'key'))->toBe([
        'submitted', 'paid', 'core_documents', 'canonical_interview', 'banns_requested', 'pre_cana',
        'banns_completed', 'marriage_license', 'confession', 'approved', 'wedding_day', 'civil_registry',
    ]);
    expect(array_column($rows, 'label'))->toBe([
        'Booking submitted', 'Fee paid', 'Core documents accepted', 'Canonical interview', 'Banns requested', 'Pre-Cana seminar',
        'Banns completed or dispensed', 'Marriage license or Art. 34 affidavit', 'Confession', 'Booking approved', 'Wedding day',
        'Marriage certificate sent to the Local Civil Registrar',
    ]);
    expect(array_column($rows, 'dueDate'))->toBe([
        null, null, null, '2027-01-05', '2027-01-20', '2027-02-04', '2027-02-20', '2027-02-20', '2027-03-03', null, null, '2027-03-21',
    ]);
    expect(array_keys($rows[3]))->toBe(['key', 'label', 'done', 'state', 'source', 'dueDate', 'gating', 'manual', 'note', 'doneAt', 'data', 'doneBy']);

    $by = collect($rows)->keyBy('key');
    expect($by->where('gating', true)->keys()->all())->toBe(['core_documents', 'canonical_interview', 'pre_cana', 'banns_completed', 'marriage_license'])
        ->and($by->where('manual', true)->keys()->all())->toBe(['canonical_interview', 'banns_requested', 'pre_cana', 'banns_completed', 'marriage_license', 'confession', 'civil_registry'])
        ->and($by['canonical_interview'])->toMatchArray(['done' => false, 'state' => 'upcoming', 'source' => null, 'note' => null, 'doneAt' => null, 'data' => null, 'doneBy' => null]);
});

test('a non-Catholic groom or bride adds the mixed marriage step, sixth, and it gates', function () {
    foreach ([['groomReligion' => 'Aglipayan'], ['brideReligion' => 'Islam'], ['groomReligion' => 'None', 'brideReligion' => 'Other']] as $answers) {
        $rows = steps(wedding(answers: $answers));

        expect(array_keys($rows))->toHaveCount(13)->and(array_keys($rows)[5])->toBe('mixed_marriage_permission')
            ->and($rows['mixed_marriage_permission'])->toMatchArray([
                'label' => 'Permission for a mixed marriage', 'dueDate' => '2027-02-04', 'gating' => true, 'manual' => true, 'done' => false,
            ]);
    }
});

test('Catholic is read whatever the letter case or spacing, and an empty religion adds no step', function () {
    foreach (['Roman Catholic', 'roman catholic', '  ROMAN   CATHOLIC ', 'Catholic', 'catholic ', '', null] as $religion) {
        expect(steps(wedding(answers: ['groomReligion' => $religion])))->not->toHaveKey('mixed_marriage_permission');
    }
    expect(steps(wedding(answers: ['groomReligion' => '', 'brideReligion' => 'Catholic Apostolic'])))->toHaveKey('mixed_marriage_permission');
});

test('the parishioner sees the same steps without who ticked them or the office note', function () {
    $booking = wedding();
    tick($booking, 'canonical_interview', ['done' => true, 'note' => 'Interviewed by Fr. Jun'])->assertOk();

    $rows = collect($this->actingAs($this->owner)->getJson("/api/bookings/{$booking->id}")->assertOk()->json('milestones'))->keyBy('key');
    expect($rows)->toHaveCount(12)
        ->and($rows['canonical_interview'])->toMatchArray(['done' => true, 'state' => 'done', 'source' => 'staff'])
        ->and($rows['canonical_interview'])->not->toHaveKey('doneBy')->not->toHaveKey('note');
    expect(json_encode($rows))->not->toContain('Interviewed by Fr. Jun');
    // The office keeps both.
    expect(steps($booking)['canonical_interview']['doneBy'])->toBe(['id' => $this->staff->id, 'fullName' => 'Sam Staff'])
        ->and(steps($booking)['canonical_interview']['note'])->toBe('Interviewed by Fr. Jun');
});

test('lists carry the steps too, and every other sacrament has none', function () {
    $wedding = wedding();
    $blessing = Booking::factory()->scheduled('2026-11-20', '10:00', '11:00')->create([
        'user_id' => $this->owner->id, 'sacrament' => 'house-blessing', 'status' => 'approved', 'payment_status' => 'not_required', 'form_data' => ['propertyOwner' => 'Rita Reyes'],
    ]);

    $mine = collect($this->actingAs($this->owner)->getJson('/api/bookings')->assertOk()->json())->keyBy('id');
    expect($mine[$wedding->id]['milestones'])->toHaveCount(12)->and($mine[$blessing->id]['milestones'])->toBe([]);
    $queue = collect($this->actingAs($this->staff)->getJson('/api/admin/bookings')->assertOk()->json('data'))->keyBy('id');
    expect($queue[$wedding->id]['milestones'])->toHaveCount(12)->and($queue[$blessing->id]['milestones'])->toBe([]);

    $this->actingAs($this->owner)->getJson("/api/bookings/{$blessing->id}")->assertOk()->assertJsonPath('milestones', []);
    $this->actingAs($this->staff)->getJson("/api/admin/bookings/{$blessing->id}")->assertOk()->assertJsonPath('milestones', []);
});

// ---- Derived steps -------------------------------------------------------------------------

test('each automatic step follows the booking', function () {
    $draft = steps(wedding(['status' => 'draft', 'payment_status' => null, 'paid_at' => null]));
    expect($draft['submitted']['done'])->toBeFalse()->and($draft['paid']['done'])->toBeFalse()->and($draft['approved']['done'])->toBeFalse()
        ->and($draft['submitted'])->toMatchArray(['state' => 'upcoming', 'source' => null, 'gating' => false, 'manual' => false]);

    $submitted = steps(wedding(['status' => 'submitted', 'payment_status' => 'unpaid', 'paid_at' => null]));
    expect($submitted['submitted'])->toMatchArray(['done' => true, 'state' => 'done', 'source' => 'auto'])
        ->and($submitted['paid']['done'])->toBeFalse()->and($submitted['approved']['done'])->toBeFalse()->and($submitted['wedding_day']['done'])->toBeFalse();

    $approved = steps(wedding());
    expect($approved['paid'])->toMatchArray(['done' => true, 'source' => 'auto', 'doneAt' => now()->toISOString()])
        ->and($approved['approved']['done'])->toBeTrue()->and($approved['wedding_day']['done'])->toBeFalse();
    expect(steps(wedding(['payment_status' => 'not_required', 'paid_at' => null]))['paid']['done'])->toBeTrue();
    expect(steps(wedding(['status' => 'returned']))['submitted']['done'])->toBeTrue();

    $completed = steps(wedding(['status' => 'completed'], '2026-10-24'));
    expect($completed['approved']['done'])->toBeTrue()->and($completed['wedding_day'])->toMatchArray(['done' => true, 'state' => 'done', 'source' => 'auto']);
});

test('core documents are done only when every required document is accepted', function () {
    $booking = wedding(['status' => 'submitted']);
    expect(steps($booking)['core_documents']['done'])->toBeFalse();

    $required = collect($booking->documentChecklist())->where('required', true)->pluck('key');
    expect($required)->toHaveCount(9); // four each (baptismal, confirmation, CENOMAR, 2x2 photo), and the widowed bride's late husband's death certificate
    foreach ($required->slice(1) as $key) {
        review($booking, $key, 'accepted')->assertOk();
    }
    expect(steps($booking)['core_documents']['done'])->toBeFalse();

    review($booking, $required->first(), 'rejected', 'Blurry')->assertOk();
    expect(steps($booking)['core_documents']['done'])->toBeFalse();
    review($booking, $required->first(), 'accepted')->assertOk();
    expect(steps($booking)['core_documents'])->toMatchArray(['done' => true, 'state' => 'done', 'source' => 'auto']);

    // A required document that is missing altogether keeps the step open.
    $data = (array) $booking->fresh()->form_data;
    unset($data['groomCenomar']);
    $booking->update(['form_data' => $data]);
    expect(steps($booking)['core_documents']['done'])->toBeFalse();
});

test('a document-backed step is done by an accepted document, not by an upload or a refused one', function (string $step, string $key) {
    $booking = wedding(['status' => 'submitted']);
    $this->actingAs($this->owner)->putJson("/api/bookings/{$booking->id}/documents/{$key}", ['fileUrl' => uploaded($this->owner, 'late.pdf')])->assertOk();
    expect(steps($booking)[$step]['done'])->toBeFalse();

    review($booking, $key, 'rejected', 'Not readable')->assertOk();
    expect(steps($booking)[$step])->toMatchArray(['done' => false, 'source' => null]);

    review($booking, $key, 'accepted')->assertOk();
    expect(steps($booking)[$step])->toMatchArray(['done' => true, 'state' => 'done', 'source' => 'document', 'note' => null, 'doneBy' => null])
        ->and(steps($booking)[$step]['doneAt'])->not->toBeNull();
})->with([
    ['pre_cana', 'preCanaCertificate'], ['banns_completed', 'bannsCertificate'], ['confession', 'confessionCertificate'],
]);

test('a document-backed step is also done by a staff tick, with no document at all', function () {
    $booking = wedding();
    foreach (['pre_cana', 'banns_completed', 'confession'] as $step) {
        tick($booking, $step, ['done' => true, 'note' => 'Certificate seen at the office'])->assertOk();
        expect(steps($booking)[$step])->toMatchArray(['done' => true, 'source' => 'staff', 'note' => 'Certificate seen at the office', 'doneAt' => now()->toISOString()]);
    }
});

test('an uploaded and accepted marriage license does not complete the license step by itself', function () {
    $booking = wedding();
    $this->actingAs($this->owner)->putJson("/api/bookings/{$booking->id}/documents/marriageLicense", ['fileUrl' => uploaded($this->owner, 'license.pdf')])->assertOk();
    review($booking, 'marriageLicense', 'accepted')->assertOk();

    expect(steps($booking)['marriage_license'])->toMatchArray(['done' => false, 'source' => null]);
});

// ---- State: due, overdue, upcoming ---------------------------------------------------------

test('a step is upcoming, then due within seven days, then overdue', function () {
    $booking = wedding(); // interview due 2027-01-05

    expect(steps($booking)['canonical_interview']['state'])->toBe('upcoming');
    Carbon::setTestNow(Carbon::parse('2026-12-28 16:00:00', 'UTC')); // Dec 29 in Manila: exactly seven days before
    expect(steps($booking)['canonical_interview']['state'])->toBe('due');
    Carbon::setTestNow(Carbon::parse('2026-12-27 15:00:00', 'UTC')); // Dec 27 in Manila: nine days before
    expect(steps($booking)['canonical_interview']['state'])->toBe('upcoming');
    Carbon::setTestNow(Carbon::parse('2027-01-05 02:00:00', 'UTC')); // the due day itself
    expect(steps($booking)['canonical_interview']['state'])->toBe('due');
    Carbon::setTestNow(Carbon::parse('2027-01-06 02:00:00', 'UTC'));
    expect(steps($booking)['canonical_interview']['state'])->toBe('overdue');

    tick($booking, 'canonical_interview')->assertOk();
    expect(steps($booking)['canonical_interview']['state'])->toBe('done');
});

// Review Focus 2
test('a wedding booked ten days ahead shows the steps it could never have met as due, not overdue, and can still be completed', function () {
    $booking = wedding(date: '2026-11-12');
    acceptAllDocuments($booking);

    $rows = steps($booking);
    foreach (['canonical_interview', 'banns_requested', 'pre_cana', 'banns_completed', 'marriage_license'] as $step) {
        expect($rows[$step]['state'])->toBe('due', $step);
    }
    expect($rows['canonical_interview']['dueDate'])->toBe('2026-09-13')->and($rows['confession'])->toMatchArray(['dueDate' => '2026-11-09', 'state' => 'due']);

    Carbon::setTestNow(Carbon::parse('2026-11-12 01:00:00', 'UTC')); // the wedding day
    $rows = steps($booking);
    expect($rows['canonical_interview']['state'])->toBe('due')->and($rows['marriage_license']['state'])->toBe('due')
        ->and($rows['confession']['state'])->toBe('overdue'); // this one came due after they booked

    $this->actingAs($this->staff)->patchJson("/api/admin/bookings/{$booking->id}/complete")->assertUnprocessable()
        ->assertExactJson(['message' => 'Cannot complete: these preparation steps are not done — Canonical interview, Pre-Cana seminar, Banns completed or dispensed, Marriage license or Art. 34 affidavit.']);

    foreach (['canonical_interview', 'pre_cana', 'banns_completed'] as $step) {
        tick($booking, $step, ['done' => true, 'note' => 'Short notice, done at the office'])->assertOk();
    }
    tick($booking, 'marriage_license', LICENSE)->assertOk();

    $this->actingAs($this->staff)->patchJson("/api/admin/bookings/{$booking->id}/complete")->assertOk()->assertJsonPath('status', 'completed');
    expect(RegisterEntry::where('booking_id', $booking->id)->exists())->toBeTrue();
});

test('the first submission is what counts for overdue, not the day the draft was made or a later resubmission', function () {
    $submittedOn = function (Booking $booking, string $action, string $utc) {
        AuditLog::create(['actor_user_id' => null, 'action' => $action, 'subject_type' => 'booking', 'subject_id' => $booking->id, 'metadata' => [], 'created_at' => Carbon::parse($utc, 'UTC')]);
    };

    // Wedding 2026-11-20: interview due 09-21, banns asked 10-06.
    $returned = wedding(['created_at' => Carbon::parse('2026-08-01 02:00:00', 'UTC')], '2026-11-20');
    $submittedOn($returned, 'booking.submitted', '2026-09-20 02:00:00');
    $submittedOn($returned, 'booking.resubmitted', '2026-10-30 02:00:00');
    expect(steps($returned)['canonical_interview']['state'])->toBe('overdue')->and(steps($returned)['banns_requested']['state'])->toBe('overdue');

    // A draft kept since August and first sent in October: the interview date had already passed by then.
    $late = wedding(['created_at' => Carbon::parse('2026-08-01 02:00:00', 'UTC'), 'appointment_start' => '14:00', 'appointment_end' => '15:30'], '2026-11-20');
    $submittedOn($late, 'booking.submitted', '2026-10-01 02:00:00');
    expect(steps($late)['canonical_interview']['state'])->toBe('due')->and(steps($late)['banns_requested']['state'])->toBe('overdue');

    // The submission day is read in parish time: 17:00 UTC on Sep 21 is already Sep 22 in Manila, a day after the interview date.
    $edge = wedding(['created_at' => Carbon::parse('2026-08-01 02:00:00', 'UTC'), 'appointment_start' => '16:00', 'appointment_end' => '17:30'], '2026-11-20');
    $submittedOn($edge, 'booking.submitted', '2026-09-21 17:00:00');
    expect(steps($edge)['canonical_interview']['state'])->toBe('due');

    // No audit row at all (old data): the day the booking was made stands in.
    $old = wedding(['created_at' => Carbon::parse('2026-10-01 02:00:00', 'UTC'), 'appointment_start' => '08:00', 'appointment_end' => '09:30'], '2026-11-20');
    expect(steps($old)['canonical_interview']['state'])->toBe('due')->and(steps($old)['banns_requested']['state'])->toBe('overdue');
});

test('due dates follow a rescheduled wedding', function () {
    $booking = wedding();
    $booking->update(['appointment_date' => '2027-04-10']);

    $rows = steps($booking);
    expect($rows['canonical_interview']['dueDate'])->toBe('2027-02-09')->and($rows['confession']['dueDate'])->toBe('2027-04-07')
        ->and($rows['civil_registry']['dueDate'])->toBe('2027-04-25');
});

// ---- Ticking -------------------------------------------------------------------------------

test('staff tick a step with a note and it is audited; an admin can too', function () {
    $booking = wedding();

    $res = tick($booking, 'banns_requested', ['done' => true, 'note' => 'Letter sent to the bride\'s parish'])->assertOk()->assertJsonPath('status', 'approved');
    $row = collect($res->json('milestones'))->firstWhere('key', 'banns_requested');
    expect($row)->toMatchArray(['done' => true, 'state' => 'done', 'source' => 'staff', 'note' => 'Letter sent to the bride\'s parish', 'data' => null,
        'doneAt' => now()->toISOString(), 'doneBy' => ['id' => $this->staff->id, 'fullName' => 'Sam Staff']]);

    $log = AuditLog::where('action', 'milestone.ticked')->sole();
    expect($log->subject_id)->toBe($booking->id)->and($log->actor_user_id)->toBe($this->staff->id)
        ->and($log->metadata)->toMatchArray(['key' => 'banns_requested', 'label' => 'Banns requested', 'note' => 'Letter sent to the bride\'s parish', 'data' => null]);

    tick($booking, 'canonical_interview', ['done' => true], $this->admin)->assertOk();
    expect(steps($booking)['canonical_interview']['doneBy']['fullName'])->toBe('Ada Admin');
});

test('unticking removes the tick and is audited; unticking twice is harmless', function () {
    $booking = wedding();
    tick($booking, 'canonical_interview', ['done' => true, 'note' => 'Done'])->assertOk();

    tick($booking, 'canonical_interview', ['done' => false], $this->admin)->assertOk();
    expect(steps($booking)['canonical_interview'])->toMatchArray(['done' => false, 'source' => null, 'note' => null, 'doneAt' => null, 'doneBy' => null])
        ->and(BookingMilestone::count())->toBe(0);
    $log = AuditLog::where('action', 'milestone.unticked')->sole();
    expect($log->actor_user_id)->toBe($this->admin->id)->and($log->metadata)->toMatchArray(['key' => 'canonical_interview', 'note' => 'Done']);

    tick($booking, 'canonical_interview', ['done' => false])->assertOk();
    expect(AuditLog::where('action', 'milestone.unticked')->count())->toBe(1);
});

test('ticking again replaces the note and who vouched', function () {
    $booking = wedding();
    tick($booking, 'pre_cana', ['done' => true, 'note' => 'First'])->assertOk();
    tick($booking, 'pre_cana', ['done' => true, 'note' => 'Second'], $this->admin)->assertOk();

    expect(BookingMilestone::count())->toBe(1)
        ->and(steps($booking)['pre_cana'])->toMatchArray(['note' => 'Second', 'doneBy' => ['id' => $this->admin->id, 'fullName' => 'Ada Admin']]);
});

test('the tick body is checked', function () {
    $booking = wedding(answers: ['brideReligion' => 'Islam']);

    tick($booking, 'canonical_interview', [])->assertUnprocessable()->assertJsonValidationErrors('done');
    tick($booking, 'canonical_interview', ['done' => true, 'note' => str_repeat('a', 501)])->assertUnprocessable()->assertJsonValidationErrors('note');
    tick($booking, 'mixed_marriage_permission', ['done' => true])->assertUnprocessable()->assertJsonValidationErrors('note');
    tick($booking, 'mixed_marriage_permission', ['done' => true, 'note' => 'Bishop\'s permission dated Jan 12, 2027'])->assertOk();
    tick($booking, 'mixed_marriage_permission', ['done' => false])->assertOk(); // no note needed to untick
});

test('only the steps staff do by hand can be ticked', function () {
    $booking = wedding();

    foreach (['submitted', 'paid', 'core_documents', 'approved', 'wedding_day', 'nope'] as $key) {
        tick($booking, $key)->assertUnprocessable()->assertExactJson(['message' => 'That step cannot be ticked by hand.']);
    }
    // Both are Catholic, so there is no such step on this booking.
    tick($booking, 'mixed_marriage_permission', ['done' => true, 'note' => 'x'])->assertUnprocessable()
        ->assertExactJson(['message' => 'This couple does not need permission for a mixed marriage.']);
    expect(BookingMilestone::count())->toBe(0);
});

test('ticks are for wedding bookings only', function () {
    $funeral = Booking::factory()->scheduled('2026-11-03', '10:00', '11:00')->create([
        'user_id' => $this->owner->id, 'sacrament' => 'funeral', 'status' => 'approved', 'payment_status' => 'not_required',
        'form_data' => formDataFixture('funeral/valid-basic', $this->owner->id),
    ]);

    tick($funeral, 'confession')->assertUnprocessable()->assertExactJson(['message' => 'Only a wedding booking has preparation steps.']);
    tick($funeral, 'civil_registry')->assertUnprocessable();
    expect(BookingMilestone::count())->toBe(0);
});

test('ticks need a submitted or approved wedding; after completion only the civil registry step is open', function () {
    foreach (['draft', 'returned', 'declined', 'cancelled'] as $status) {
        $booking = wedding(['status' => $status]);
        tick($booking, 'canonical_interview')->assertUnprocessable()
            ->assertExactJson(['message' => 'Preparation steps can only be updated while the booking is submitted or approved.']);
        tick($booking, 'civil_registry')->assertUnprocessable();
    }
    tick(wedding(['status' => 'submitted', 'appointment_start' => '13:00']), 'canonical_interview')->assertOk();

    $approved = wedding(['appointment_start' => '15:00']);
    tick($approved, 'civil_registry')->assertUnprocessable()->assertExactJson(['message' => 'The civil registry step opens once the wedding is completed.']);

    $done = wedding(['status' => 'completed'], '2026-10-24');
    BookingMilestone::create(['booking_id' => $done->id, 'key' => 'canonical_interview', 'done_at' => now(), 'done_by' => $this->staff->id]);
    foreach (['canonical_interview', 'banns_requested', 'pre_cana', 'banns_completed', 'confession'] as $key) {
        foreach ([true, false] as $state) {
            tick($done, $key, ['done' => $state])->assertUnprocessable()
                ->assertExactJson(['message' => 'This wedding is completed. Only the civil registry step can still be updated.']);
        }
    }
    tick($done, 'marriage_license', LICENSE)->assertUnprocessable();
    expect(steps($done)['canonical_interview']['done'])->toBeTrue(); // the untick was refused

    tick($done, 'civil_registry', ['done' => true, 'note' => 'Sent Oct 30, received by Ms. Cruz'])->assertOk()->assertJsonPath('status', 'completed');
    expect(steps($done)['civil_registry'])->toMatchArray(['done' => true, 'dueDate' => '2026-11-08', 'gating' => false]);
    tick($done, 'civil_registry', ['done' => false])->assertOk();
    expect(steps($done)['civil_registry']['done'])->toBeFalse();
});

test('ticking is for the office only', function () {
    $booking = wedding();

    tick($booking, 'canonical_interview', ['done' => true], $this->owner)->assertForbidden();
    $this->putJson("/api/admin/bookings/{$booking->id}/milestones/canonical_interview", ['done' => true]);
    tick($booking, 'canonical_interview', ['done' => true], $this->staff)->assertOk();
    tick($booking, 'canonical_interview', ['done' => true], $this->admin)->assertOk();
    $this->actingAs($this->staff)->putJson('/api/admin/bookings/'.\Illuminate\Support\Str::uuid().'/milestones/canonical_interview', ['done' => true])->assertNotFound();
});

// ---- Marriage license ----------------------------------------------------------------------

test('the license tick records the number, date and place of issue', function () {
    $booking = wedding(date: '2027-02-20'); // within the 120 days a license issued on Oct 30 covers

    tick($booking, 'marriage_license', LICENSE + ['note' => 'Original seen'])->assertOk();
    expect(steps($booking)['marriage_license'])->toMatchArray([
        'done' => true, 'source' => 'staff', 'note' => 'Original seen',
        'data' => ['licenseNumber' => 'ML-2027-00123', 'issuedOn' => '2026-10-30', 'issuedAt' => 'Imus City Civil Registrar'],
    ]);
    expect(AuditLog::where('action', 'milestone.ticked')->sole()->metadata['data'])->toEqualCanonicalizing(['licenseNumber' => 'ML-2027-00123', 'issuedOn' => '2026-10-30', 'issuedAt' => 'Imus City Civil Registrar']);
    // The parishioner sees the details too: it is their own license. The note is the office's.
    $mine = collect($this->actingAs($this->owner)->getJson("/api/bookings/{$booking->id}")->json('milestones'))->firstWhere('key', 'marriage_license');
    expect($mine['data']['licenseNumber'])->toBe('ML-2027-00123')->and($mine)->not->toHaveKey('note');
});

test('an Art. 34 affidavit is ticked with a note instead of license details', function () {
    $booking = wedding();

    tick($booking, 'marriage_license', ['done' => true, 'art34' => true])->assertUnprocessable()->assertJsonValidationErrors('note');
    tick($booking, 'marriage_license', ['done' => true, 'art34' => true, 'note' => 'Affidavit of cohabitation, notarized Oct 2026'])->assertOk();

    expect(steps($booking)['marriage_license'])->toMatchArray(['done' => true, 'data' => ['art34' => true], 'note' => 'Affidavit of cohabitation, notarized Oct 2026']);
});

test('a license tick without its details is refused', function () {
    $booking = wedding();

    tick($booking, 'marriage_license', ['done' => true])->assertUnprocessable()->assertJsonValidationErrors(['licenseNumber', 'issuedOn', 'issuedAt']);
    tick($booking, 'marriage_license', ['licenseNumber' => str_repeat('1', 41), 'issuedAt' => str_repeat('a', 121), 'issuedOn' => '30/10/2026'] + LICENSE)
        ->assertUnprocessable()->assertJsonValidationErrors(['licenseNumber', 'issuedOn', 'issuedAt']);
    tick($booking, 'marriage_license', ['done' => false])->assertOk(); // nothing needed to untick
    expect(BookingMilestone::count())->toBe(0);
});

// Review Focus 3
test('a license covers weddings for 120 days from its issue date: day 120 passes, day 121 does not', function () {
    $booking = wedding(date: '2027-02-20');
    Carbon::setTestNow(Carbon::parse('2026-12-01 02:00:00', 'UTC'));

    // Issued 2026-10-23: day 120 is the wedding day itself.
    expect(Carbon::parse('2026-10-23')->addDays(120)->toDateString())->toBe('2027-02-20');
    tick($booking, 'marriage_license', ['issuedOn' => '2026-10-23'] + LICENSE)->assertOk();
    tick($booking, 'marriage_license', ['done' => false])->assertOk();

    $res = tick($booking, 'marriage_license', ['issuedOn' => '2026-10-22'] + LICENSE)->assertUnprocessable();
    $res->assertJsonPath('message', 'A marriage license is valid for 120 days: issued October 22, 2026, it covers weddings until February 19, 2027.')
        ->assertJsonValidationErrors('issuedOn');
    expect(steps($booking)['marriage_license']['done'])->toBeFalse()->and(BookingMilestone::count())->toBe(0);

    // The wedding day itself is a fine day to be issued a license.
    Carbon::setTestNow(Carbon::parse('2027-02-20 01:00:00', 'UTC'));
    tick($booking, 'marriage_license', ['issuedOn' => '2027-02-20'] + LICENSE)->assertOk();
});

test('a license issued after the wedding date, or dated in the future, is refused', function () {
    $past = wedding(date: '2026-10-25'); // approved, the day has passed and it is not yet marked completed
    tick($past, 'marriage_license', ['issuedOn' => '2026-10-26'] + LICENSE)->assertUnprocessable()
        ->assertJsonPath('message', 'A marriage license is valid for 120 days: issued October 26, 2026, it covers weddings until February 23, 2027.');
    tick($past, 'marriage_license', ['issuedOn' => '2026-10-25'] + LICENSE)->assertOk();

    $ahead = wedding(['appointment_start' => '14:00']);
    tick($ahead, 'marriage_license', ['issuedOn' => '2026-11-03'] + LICENSE)->assertUnprocessable()
        ->assertJsonPath('message', 'The issue date cannot be in the future.')->assertJsonValidationErrors('issuedOn');
    tick($ahead, 'marriage_license', ['issuedOn' => '2026-11-02'] + LICENSE)->assertUnprocessable() // today, but 124 days before the wedding
        ->assertJsonPath('message', 'A marriage license is valid for 120 days: issued November 2, 2026, it covers weddings until March 2, 2027.');
});

/// ---- Marriage license after a reschedule ---------------------------------------------------

/** Records a license tick directly, as if staff had ticked it when it was valid. */
function licensed(Booking $booking, string $issuedOn): BookingMilestone
{
    return BookingMilestone::create([
        'booking_id' => $booking->id, 'key' => 'marriage_license', 'done_at' => now(), 'done_by' => test()->staff->id, 'note' => null,
        'data' => ['licenseNumber' => 'ML-2027-00123', 'issuedOn' => $issuedOn, 'issuedAt' => 'Imus City Civil Registrar'],
    ]);
}

function staffMove(Booking $booking, string $date, string $start = '09:30')
{
    return test()->actingAs(test()->staff)->patchJson("/api/admin/bookings/{$booking->id}/reschedule", [
        'appointmentDate' => $date, 'appointmentStart' => $start, 'reason' => 'Family asked',
    ]);
}

test('moving a wedding inside the license window keeps the tick; day 120 keeps it and day 121 removes it', function () {
    Carbon::setTestNow(Carbon::parse('2026-12-01 02:00:00', 'UTC'));
    $keeps = wedding(date: '2027-02-27');
    licensed($keeps, '2026-11-06'); // covers until 2027-03-06, which is day 120
    expect(Carbon::parse('2026-11-06')->addDays(120)->toDateString())->toBe('2027-03-06');

    staffMove($keeps, '2027-03-06')->assertOk();
    expect(steps($keeps)['marriage_license']['done'])->toBeTrue()
        ->and(AuditLog::where('action', 'milestone.unticked')->count())->toBe(0)
        ->and(AppNotification::where('title', 'License needs checking')->count())->toBe(0);

    $loses = wedding(['appointment_start' => '14:00'], '2027-02-27');
    licensed($loses, '2026-11-05'); // covers until 2027-03-05; the 6th is day 121
    staffMove($loses, '2027-03-06', '14:30')->assertOk()->assertJsonPath('appointmentDate', '2027-03-06');
    expect(steps($loses)['marriage_license']['done'])->toBeFalse()->and(BookingMilestone::where('booking_id', $loses->id)->count())->toBe(0);
});

test('a license is removed when the wedding moves to a date before it was issued', function () {
    Carbon::setTestNow(Carbon::parse('2026-12-01 02:00:00', 'UTC'));
    $booking = wedding(date: '2027-03-20');
    licensed($booking, '2027-03-13');

    staffMove($booking, '2027-03-06')->assertOk();

    expect(BookingMilestone::where('booking_id', $booking->id)->count())->toBe(0);
});

test('removing the license is audited with its details and the reason, and staff are told', function () {
    Carbon::setTestNow(Carbon::parse('2026-12-01 02:00:00', 'UTC'));
    $booking = wedding(date: '2027-02-27');
    licensed($booking, '2026-10-30');

    staffMove($booking, '2027-03-06')->assertOk(); // day 127

    $audit = AuditLog::where('action', 'milestone.unticked')->sole();
    expect($audit->metadata)->toMatchArray(['key' => 'marriage_license', 'reason' => 'license no longer valid for the new date'])
        ->and($audit->metadata['data']['issuedOn'])->toBe('2026-10-30')
        ->and($audit->actor_user_id)->toBe($this->staff->id);

    foreach ([$this->staff, $this->admin] as $person) {
        $note = AppNotification::where('user_id', $person->id)->where('title', 'License needs checking')->sole();
        expect($note->body)->toBe("{$booking->reference_number}: the wedding was moved to March 6, 2027; the recorded marriage license (issued October 30, 2026) no longer covers it.");
    }
    expect(AppNotification::where('user_id', $this->owner->id)->where('title', 'License needs checking')->count())->toBe(0);
});

test('the owner moving the wedding also rechecks the license, and the move still succeeds', function () {
    Carbon::setTestNow(Carbon::parse('2026-12-01 02:00:00', 'UTC'));
    $booking = wedding(date: '2027-02-27');
    licensed($booking, '2026-10-30');

    $this->actingAs($this->owner)->patchJson("/api/bookings/{$booking->id}/reschedule", ['appointmentDate' => '2027-03-06', 'appointmentStart' => '09:30'])
        ->assertOk()->assertJsonPath('appointmentDate', '2027-03-06');

    expect(BookingMilestone::where('booking_id', $booking->id)->count())->toBe(0)
        ->and(AuditLog::where('action', 'milestone.unticked')->sole()->actor_user_id)->toBe($this->owner->id)
        ->and(AppNotification::where('user_id', $this->staff->id)->where('title', 'License needs checking')->count())->toBe(1);
});

test('completion is blocked by the license step after the license was removed', function () {
    Carbon::setTestNow(Carbon::parse('2026-12-01 02:00:00', 'UTC'));
    $booking = wedding(date: '2027-02-27');
    licensed($booking, '2026-10-30');
    completeWeddingPreparation($booking);
    staffMove($booking, '2027-03-06')->assertOk();

    Carbon::setTestNow(Carbon::parse('2027-03-06 03:00:00', 'UTC'));
    $this->actingAs($this->staff)->patchJson("/api/admin/bookings/{$booking->id}/complete")->assertUnprocessable()
        ->assertExactJson(['message' => 'Cannot complete: these preparation steps are not done — Marriage license or Art. 34 affidavit.']);
});

test('an Art. 34 affidavit, a wedding with no license tick and any other sacrament are unaffected by a move', function () {
    Carbon::setTestNow(Carbon::parse('2026-12-01 02:00:00', 'UTC'));
    $affidavit = wedding(date: '2027-02-27');
    tick($affidavit, 'marriage_license', ['done' => true, 'art34' => true, 'note' => 'Notarized'])->assertOk();
    $bare = wedding(['appointment_start' => '14:00'], '2027-02-27');
    $blessing = Booking::factory()->scheduled('2026-12-10', '10:00', '10:45')->create([
        'user_id' => $this->owner->id, 'sacrament' => 'house-blessing', 'status' => 'approved', 'payment_status' => 'not_required',
        'is_offsite' => true, 'form_data' => ['propertyType' => 'house', 'propertyOwner' => 'A'],
    ]);

    staffMove($affidavit, '2027-03-06')->assertOk();
    staffMove($bare, '2027-03-06', '14:30')->assertOk();
    staffMove($blessing, '2026-12-12')->assertOk();

    expect(BookingMilestone::where('booking_id', $affidavit->id)->count())->toBe(1)
        ->and(AuditLog::where('action', 'milestone.unticked')->count())->toBe(0)
        ->and(AppNotification::where('title', 'License needs checking')->count())->toBe(0);
});

// ---- Late uploads --------------------------------------------------------------------------

test('the owner adds a later document to an approved wedding without sending it back to review', function () {
    $booking = wedding();
    $url = uploaded($this->owner, 'pre-cana.pdf');

    $res = $this->actingAs($this->owner)->putJson("/api/bookings/{$booking->id}/documents/preCanaCertificate", ['fileUrl' => $url])->assertOk();
    $res->assertJsonPath('status', 'approved')->assertJsonPath('formData.preCanaCertificate', $url);
    expect(collect($res->json('documents'))->firstWhere('key', 'preCanaCertificate'))->toMatchArray(['url' => $url, 'review' => null, 'required' => false]);

    expect($booking->fresh()->status->value)->toBe('approved');
    $log = AuditLog::where('action', 'document.attached_late')->sole();
    expect($log->subject_id)->toBe($booking->id)->and($log->actor_user_id)->toBe($this->owner->id)
        ->and($log->metadata)->toMatchArray(['documentKey' => 'preCanaCertificate', 'label' => 'Pre-Cana seminar certificate', 'replaced' => false]);

    foreach ([$this->staff, $this->admin] as $office) {
        $note = AppNotification::where('user_id', $office->id)->sole();
        expect($note->title)->toBe('Document added')->and($note->body)->toBe("{$booking->reference_number}: Pre-Cana seminar certificate was uploaded and needs review.");
        expect($note->booking_id)->toBe($booking->id); // the bell item opens the booking
        $this->actingAs($office)->getJson('/api/notifications')->assertOk()->assertJsonPath('0.bookingId', $booking->id);
    }
    expect(AppNotification::where('user_id', $this->owner->id)->count())->toBe(0);
});

test('each of the four later documents can be added, to a submitted wedding as well', function () {
    $booking = wedding(['status' => 'submitted']);

    foreach (WeddingMilestones::LATE_KEYS as $key) {
        $this->actingAs($this->owner)->putJson("/api/bookings/{$booking->id}/documents/{$key}", ['fileUrl' => uploaded($this->owner, "{$key}.pdf")])
            ->assertOk()->assertJsonPath('status', 'submitted');
    }
    expect(WeddingMilestones::LATE_KEYS)->toBe(['marriageLicense', 'preCanaCertificate', 'bannsCertificate', 'confessionCertificate'])
        ->and(AuditLog::where('action', 'document.attached_late')->count())->toBe(4);
});

test('replacing a late document removes the old file, but keeps one another booking still uses', function () {
    $booking = wedding();
    $old = uploaded($this->owner, 'old.pdf');
    $new = uploaded($this->owner, 'new.pdf');
    $put = fn (string $url) => $this->actingAs($this->owner)->putJson("/api/bookings/{$booking->id}/documents/preCanaCertificate", ['fileUrl' => $url])->assertOk();

    $put($old);
    $put($new);
    expect(Storage::disk('local')->exists(ltrim($old, '/')))->toBeFalse()
        ->and(Storage::disk('local')->exists(ltrim($new, '/')))->toBeTrue();

    // A file another booking still uses stays.
    $shared = uploaded($this->owner, 'shared.pdf');
    wedding([], '2027-04-10', ['preCanaCertificate' => $shared]);
    $put($shared);
    $put(uploaded($this->owner, 'newer.pdf'));
    expect(Storage::disk('local')->exists(ltrim($shared, '/')))->toBeTrue();
});

test('a late upload is refused for any other document, status, sacrament or file', function () {
    $booking = wedding();
    $mine = uploaded($this->owner, 'mine.pdf');
    $put = fn (Booking $b, string $key, $url) => $this->actingAs($this->owner)->putJson("/api/bookings/{$b->id}/documents/{$key}", ['fileUrl' => $url]);

    foreach (['groomCenomar', 'bridePhoto', 'nope'] as $key) {
        $put($booking, $key, $mine)->assertUnprocessable()
            ->assertExactJson(['message' => 'Only the marriage license, Pre-Cana, banns and confession documents can be added after the booking is submitted.']);
    }

    foreach (['draft', 'returned', 'completed', 'cancelled', 'declined'] as $status) {
        $put(wedding(['status' => $status]), 'preCanaCertificate', $mine)->assertUnprocessable()
            ->assertExactJson(['message' => 'Documents can be added only while the booking is submitted or approved.']);
    }

    $funeral = Booking::factory()->scheduled('2026-11-03', '10:00', '11:00')->create([
        'user_id' => $this->owner->id, 'sacrament' => 'funeral', 'status' => 'approved', 'payment_status' => 'not_required',
        'form_data' => formDataFixture('funeral/valid-basic', $this->owner->id),
    ]);
    $put($funeral, 'preCanaCertificate', $mine)->assertUnprocessable()->assertExactJson(['message' => 'Documents can be added later only to a wedding booking.']);

    $other = User::factory()->create(['role' => 'parishioner']);
    $put($booking, 'preCanaCertificate', uploaded($other, 'theirs.pdf'))->assertUnprocessable()->assertJsonValidationErrors('fileUrl');
    $put($booking, 'preCanaCertificate', uploaded($this->staff, 'office.pdf'))->assertUnprocessable()->assertJsonValidationErrors('fileUrl');
    $put($booking, 'preCanaCertificate', "/documents/{$this->owner->id}/never-uploaded.pdf")->assertUnprocessable()->assertJsonValidationErrors('fileUrl');
    $put($booking, 'preCanaCertificate', null)->assertUnprocessable()->assertJsonValidationErrors('fileUrl');

    expect(AuditLog::where('action', 'document.attached_late')->count())->toBe(0)
        ->and($booking->fresh()->form_data)->not->toHaveKey('preCanaCertificate');
});

test('nobody else can add a document to my wedding', function () {
    $booking = wedding();
    $other = User::factory()->create(['role' => 'parishioner']);

    $this->actingAs($other)->putJson("/api/bookings/{$booking->id}/documents/preCanaCertificate", ['fileUrl' => uploaded($other, 'x.pdf')])->assertNotFound();
    expect($booking->fresh()->form_data)->not->toHaveKey('preCanaCertificate');
});

test('the office attaches a later document for a walk-in, and only for a walk-in', function () {
    $walkIn = Booking::factory()->walkIn($this->staff)->scheduled(WEDDING_DAY, '10:00', '11:30')->create([
        'sacrament' => 'wedding', 'status' => 'approved', 'payment_status' => 'paid',
        'form_data' => formDataFixture('wedding/valid-basic', $this->staff->id),
    ]);
    $url = uploaded($this->admin, 'banns.pdf'); // whoever is at the desk today

    $res = $this->actingAs($this->staff)->postJson("/api/admin/bookings/{$walkIn->id}/documents/bannsCertificate/attach", ['fileUrl' => $url])->assertOk();
    $res->assertJsonPath('status', 'approved')->assertJsonPath('formData.bannsCertificate', $url)->assertJsonStructure(['user', 'milestones']);
    expect(AuditLog::where('action', 'document.attached_late')->sole()->actor_user_id)->toBe($this->staff->id);

    // The same rules as the owner's route.
    $this->actingAs($this->staff)->postJson("/api/admin/bookings/{$walkIn->id}/documents/groomCenomar/attach", ['fileUrl' => $url])->assertUnprocessable();
    $this->actingAs($this->staff)->postJson("/api/admin/bookings/{$walkIn->id}/documents/preCanaCertificate/attach", ['fileUrl' => uploaded($this->owner, 'stranger.pdf')])
        ->assertUnprocessable()->assertJsonValidationErrors('fileUrl');
    $this->actingAs($this->owner)->postJson("/api/admin/bookings/{$walkIn->id}/documents/preCanaCertificate/attach", ['fileUrl' => $url])->assertForbidden();

    $online = wedding(['appointment_start' => '14:00']);
    $this->actingAs($this->staff)->postJson("/api/admin/bookings/{$online->id}/documents/bannsCertificate/attach", ['fileUrl' => $url])->assertUnprocessable()
        ->assertExactJson(['message' => 'The office can add documents only to a walk-in booking. An online booking\'s owner uploads their own.']);
    expect($online->fresh()->form_data)->not->toHaveKey('bannsCertificate');
});

test('a walk-in linked to an account takes a later document from the office or from its owner', function () {
    $walkIn = Booking::factory()->walkIn($this->staff)->scheduled(WEDDING_DAY, '10:00', '11:30')->create([
        'user_id' => $this->owner->id, 'sacrament' => 'wedding', 'status' => 'approved', 'payment_status' => 'paid',
        'form_data' => formDataFixture('wedding/valid-basic', $this->staff->id),
    ]);

    $this->actingAs($this->staff)->postJson("/api/admin/bookings/{$walkIn->id}/documents/bannsCertificate/attach", ['fileUrl' => uploaded($this->owner, 'from-owner.pdf')])->assertOk();
    $this->actingAs($this->owner)->putJson("/api/bookings/{$walkIn->id}/documents/confessionCertificate", ['fileUrl' => uploaded($this->owner, 'confession.pdf')])->assertOk();
    // The owner's route takes only the owner's own uploads, never a file from the office's folder.
    $this->actingAs($this->owner)->putJson("/api/bookings/{$walkIn->id}/documents/preCanaCertificate", ['fileUrl' => uploaded($this->staff, 'office.pdf')])
        ->assertUnprocessable()->assertJsonValidationErrors('fileUrl');
});

// ---- Review on an approved wedding ---------------------------------------------------------

test('a later document is reviewed on an approved wedding, while every other document stays closed', function () {
    $booking = wedding();
    acceptAllDocuments($booking);
    $this->actingAs($this->owner)->putJson("/api/bookings/{$booking->id}/documents/preCanaCertificate", ['fileUrl' => uploaded($this->owner, 'pre-cana.pdf')])->assertOk();

    review($booking, 'preCanaCertificate', 'accepted')->assertOk()->assertJsonPath('status', 'approved');
    expect(steps($booking)['pre_cana'])->toMatchArray(['done' => true, 'source' => 'document']);

    review($booking, 'groomCenomar', 'rejected', 'Second thoughts')->assertUnprocessable()
        ->assertExactJson(['message' => 'Documents can only be reviewed while the booking is awaiting review.']);
    review($booking, 'bannsCertificate', 'accepted')->assertUnprocessable()->assertExactJson(['message' => 'That document is not attached to this booking.']);

    // Completed: closed for the later documents as well.
    $done = wedding(['status' => 'completed', 'appointment_start' => '14:00'], '2026-10-24', ['preCanaCertificate' => uploaded($this->owner, 'old.pdf')]);
    review($done, 'preCanaCertificate', 'accepted')->assertUnprocessable();
});

test('refusing a later document on an approved wedding tells the owner and keeps it approved', function () {
    $booking = wedding();
    $this->actingAs($this->owner)->putJson("/api/bookings/{$booking->id}/documents/bannsCertificate", ['fileUrl' => uploaded($this->owner, 'banns.pdf')])->assertOk();

    review($booking, 'bannsCertificate', 'rejected', 'This is the request letter, not the certificate')->assertOk()->assertJsonPath('status', 'approved');

    $note = AppNotification::where('user_id', $this->owner->id)->sole();
    expect($note->title)->toBe('Document needs replacing')
        ->and($note->body)->toBe("Banns certificate for your Wedding booking ({$booking->reference_number}) was not accepted: This is the request letter, not the certificate. Please upload a new copy.");
    expect($booking->fresh()->status->value)->toBe('approved')->and(steps($booking)['banns_completed']['done'])->toBeFalse();

    // Accepting sends nothing, and neither does refusing a document on a booking still in review (returning it does that).
    review($booking, 'bannsCertificate', 'accepted')->assertOk();
    $inReview = wedding(['status' => 'submitted', 'appointment_start' => '14:00']);
    review($inReview, 'groomCenomar', 'rejected', 'Blurry')->assertOk();
    expect(AppNotification::where('user_id', $this->owner->id)->count())->toBe(1);
});

test('refusing a later document on a submitted wedding tells the owner once; a core document does not', function (string $key) {
    $booking = wedding(['status' => 'submitted'], answers: [$key => uploaded($this->owner, 'late.pdf')]);

    review($booking, $key, 'rejected', 'Not the right paper')->assertOk()->assertJsonPath('status', 'submitted');

    $note = AppNotification::where('user_id', $this->owner->id)->sole();
    expect($note->title)->toBe('Document needs replacing')
        ->and($note->body)->toContain('was not accepted: Not the right paper. Please upload a new copy.');

    review($booking, 'groomCenomar', 'rejected', 'Blurry')->assertOk();
    expect(AppNotification::where('user_id', $this->owner->id)->count())->toBe(1);
})->with(['marriageLicense', 'preCanaCertificate', 'bannsCertificate', 'confessionCertificate']);

test('replacing a later document that was accepted makes it unreviewed, and its step open, again', function () {
    $booking = wedding();
    $this->actingAs($this->owner)->putJson("/api/bookings/{$booking->id}/documents/preCanaCertificate", ['fileUrl' => uploaded($this->owner, 'first.pdf')])->assertOk();
    review($booking, 'preCanaCertificate', 'accepted')->assertOk();
    expect(steps($booking)['pre_cana']['done'])->toBeTrue();

    $res = $this->actingAs($this->owner)->putJson("/api/bookings/{$booking->id}/documents/preCanaCertificate", ['fileUrl' => uploaded($this->owner, 'second.pdf')])->assertOk();
    expect(collect($res->json('documents'))->firstWhere('key', 'preCanaCertificate')['review'])->toBeNull()
        ->and(collect($res->json('milestones'))->firstWhere('key', 'pre_cana'))->toMatchArray(['done' => false, 'source' => null])
        ->and(AuditLog::where('action', 'document.attached_late')->latest('created_at')->get()->pluck('metadata.replaced')->sort()->values()->all())->toBe([false, true]);

    review($booking, 'preCanaCertificate', 'accepted')->assertOk();
    expect(steps($booking)['pre_cana']['done'])->toBeTrue()->and(BookingDocumentReview::where('booking_id', $booking->id)->where('document_key', 'preCanaCertificate')->count())->toBe(1);
});

// ---- The completion gate -------------------------------------------------------------------

test('completing a wedding is refused while a gating step is open, naming the open steps in order', function () {
    Carbon::setTestNow(Carbon::parse('2027-03-06 03:00:00', 'UTC')); // the wedding day
    $booking = wedding(answers: ['brideReligion' => 'Other Christian']);
    $complete = fn () => $this->actingAs($this->staff)->patchJson("/api/admin/bookings/{$booking->id}/complete");
    $refusal = fn (string $labels) => ['message' => "Cannot complete: these preparation steps are not done — {$labels}."];

    $complete()->assertUnprocessable()->assertExactJson($refusal('Core documents accepted, Canonical interview, Permission for a mixed marriage, Pre-Cana seminar, Banns completed or dispensed, Marriage license or Art. 34 affidavit'));
    expect($booking->fresh()->status->value)->toBe('approved')->and(RegisterEntry::count())->toBe(0)->and(AuditLog::where('action', 'booking.completed')->count())->toBe(0);

    acceptAllDocuments($booking);
    tick($booking, 'canonical_interview')->assertOk();
    tick($booking, 'banns_completed', ['done' => true, 'note' => 'Dispensed by the bishop'])->assertOk();
    $complete()->assertUnprocessable()->assertExactJson($refusal('Permission for a mixed marriage, Pre-Cana seminar, Marriage license or Art. 34 affidavit'));

    tick($booking, 'mixed_marriage_permission', ['done' => true, 'note' => 'Permission granted Feb 1, 2027'])->assertOk();
    tick($booking, 'pre_cana')->assertOk();
    $complete()->assertUnprocessable()->assertExactJson($refusal('Marriage license or Art. 34 affidavit'));

    tick($booking, 'marriage_license', ['issuedOn' => '2027-01-15'] + LICENSE)->assertOk();
    // Confession, the banns request and the civil registry never block.
    expect(collect(steps($booking))->where('done', false)->keys()->all())->toBe(['banns_requested', 'confession', 'wedding_day', 'civil_registry']);

    $res = $complete()->assertOk()->assertJsonPath('status', 'completed');
    expect(collect($res->json('milestones'))->firstWhere('key', 'wedding_day')['done'])->toBeTrue()
        ->and(RegisterEntry::where('booking_id', $booking->id)->count())->toBe(1);
});

test('unticking a gating step blocks completion again', function () {
    Carbon::setTestNow(Carbon::parse('2027-03-06 03:00:00', 'UTC'));
    $booking = wedding();
    completeWeddingPreparation($booking);
    tick($booking, 'pre_cana', ['done' => false])->assertOk();

    $this->actingAs($this->staff)->patchJson("/api/admin/bookings/{$booking->id}/complete")->assertUnprocessable()
        ->assertExactJson(['message' => 'Cannot complete: these preparation steps are not done — Pre-Cana seminar.']);

    tick($booking, 'pre_cana')->assertOk();
    $this->actingAs($this->staff)->patchJson("/api/admin/bookings/{$booking->id}/complete")->assertOk();
});

test('the gate also holds when the state machine is called directly, and the appointment-date rule still comes first', function () {
    $machine = app(\App\Services\Booking\BookingStateMachine::class);
    $booking = wedding();

    expect(fn () => $machine->complete($booking, $this->staff))->toThrow(\App\Exceptions\BookingRuleViolation::class, 'A booking can only be completed on or after its appointment date.');
    Carbon::setTestNow(Carbon::parse('2027-03-06 03:00:00', 'UTC'));
    expect(fn () => $machine->complete($booking, $this->staff))->toThrow(\App\Exceptions\BookingRuleViolation::class, 'Cannot complete: these preparation steps are not done');
});

test('every other sacrament completes exactly as before', function () {
    foreach ([['funeral', formDataFixture('funeral/valid-basic', $this->owner->id)], ['house-blessing', ['propertyOwner' => 'Rita Reyes']]] as $i => [$sacrament, $data]) {
        $booking = Booking::factory()->scheduled('2026-11-02', "1{$i}:00", "1{$i}:30")->create([
            'user_id' => $this->owner->id, 'sacrament' => $sacrament, 'status' => 'approved', 'payment_status' => 'not_required', 'form_data' => $data,
        ]);

        $this->actingAs($this->staff)->patchJson("/api/admin/bookings/{$booking->id}/complete")->assertOk()
            ->assertJsonPath('status', 'completed')->assertJsonPath('milestones', []);
    }
});

test('a wedding completed before the checklist existed is left alone', function () {
    $done = wedding(['status' => 'completed'], '2026-10-24');

    $rows = steps($done);
    expect($rows['wedding_day']['done'])->toBeTrue()->and($rows['canonical_interview']['done'])->toBeFalse();
    $this->actingAs($this->owner)->getJson("/api/bookings/{$done->id}")->assertOk()->assertJsonPath('status', 'completed');
});

// ---- A later document never gates approval ---------------------------------------------------

test('a submitted wedding with an unreviewed or rejected later document can still be approved', function (string $state) {
    $booking = wedding(['status' => 'submitted'], answers: ['marriageLicense' => uploaded($this->owner, 'license.pdf'), 'preCanaCertificate' => uploaded($this->owner, 'pre-cana.pdf')]);
    acceptAllDocuments($booking);
    BookingDocumentReview::where('booking_id', $booking->id)->whereIn('document_key', ['marriageLicense', 'preCanaCertificate'])->delete();
    if ($state === 'rejected') {
        review($booking, 'marriageLicense', 'rejected', 'Blurry')->assertOk();
    }

    $this->actingAs($this->staff)->patchJson("/api/admin/bookings/{$booking->id}/approve")->assertOk()->assertJsonPath('status', 'approved');
})->with(['unreviewed', 'rejected']);

test('an unreviewed core document still blocks approval of a wedding', function () {
    $booking = wedding(['status' => 'submitted'], answers: ['marriageLicense' => uploaded($this->owner, 'license.pdf')]);
    acceptAllDocuments($booking);
    BookingDocumentReview::where('booking_id', $booking->id)->where('document_key', 'groomCenomar')->delete();

    $this->actingAs($this->staff)->patchJson("/api/admin/bookings/{$booking->id}/approve")->assertUnprocessable()
        ->assertJsonPath('message', 'Review every uploaded document before approving.');
});

test('payment auto-approves a wedding whose only unreviewed document is a later one, and waits for a core one', function () {
    config(['paymongo.auto_approve_on_payment' => true]);
    $pay = function (Booking $b, string $n) {
        $b->update(['payment_status' => 'unpaid', 'paid_at' => null, 'payment_hold_expires_at' => now()->addDay()]);
        app(\App\Services\Booking\BookingStateMachine::class)->recordPayment($b, "cs_{$n}", "pay_{$n}", 500000, "evt_{$n}");

        return $b->fresh();
    };

    $late = wedding(['status' => 'submitted'], answers: ['marriageLicense' => uploaded($this->owner, 'license.pdf')]);
    acceptAllDocuments($late);
    BookingDocumentReview::where('booking_id', $late->id)->where('document_key', 'marriageLicense')->delete();
    expect($pay($late, '1')->status->value)->toBe('approved');

    $core = wedding(['status' => 'submitted', 'appointment_start' => '14:00'], '2027-03-13');
    acceptAllDocuments($core);
    BookingDocumentReview::where('booking_id', $core->id)->where('document_key', 'groomCenomar')->delete();
    expect($pay($core, '2')->status->value)->toBe('submitted');
});

test('documentsCleared leaves every other sacrament as it was and the wedding steps unchanged', function () {
    $funeral = Booking::factory()->create(['user_id' => $this->owner->id, 'sacrament' => 'funeral', 'status' => 'submitted', 'form_data' => formDataFixture('funeral/valid-basic', $this->owner->id)]);
    expect($funeral->documentsCleared())->toBeFalse();
    acceptAllDocuments($funeral);
    expect($funeral->fresh()->documentsCleared())->toBeTrue();

    // The completion gate is the steps, not documentsCleared: an unreviewed license still leaves its step open.
    $booking = wedding(['status' => 'approved'], answers: ['marriageLicense' => uploaded($this->owner, 'license.pdf')]);
    expect(steps($booking)['marriage_license']['done'])->toBeFalse();
});

test('the license window is checked against the wedding date as it is under the booking lock', function () {
    $booking = wedding(date: '2027-02-20');
    $stale = Booking::find($booking->id); // read before the office moved the wedding
    Booking::whereKey($booking->id)->update(['appointment_date' => '2027-09-01']);

    expect(fn () => app(WeddingMilestones::class)->tick($stale, 'marriage_license', $this->staff, null, ['licenseNumber' => 'ML-1', 'issuedOn' => '2026-10-30', 'issuedAt' => 'Imus']))
        ->toThrow(\Illuminate\Validation\ValidationException::class, 'A marriage license is valid for 120 days');
    expect(BookingMilestone::where('booking_id', $booking->id)->count())->toBe(0);
});
