<?php

use App\Models\AppNotification;
use App\Models\AuditLog;
use App\Models\Booking;
use App\Models\ParishSetting;
use App\Models\RegisterEntry;
use App\Models\Service;
use App\Models\User;
use App\Services\AuditTrail;
use App\Services\Register\ParishRegister;
use Database\Seeders\ParishSettingSeeder;
use Database\Seeders\ServiceSeeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

beforeEach(function () {
    $this->seed(ServiceSeeder::class);
    $this->seed(ParishSettingSeeder::class);
    Storage::fake('local');
    Carbon::setTestNow(Carbon::parse('2026-11-02 00:00:00', 'UTC')); // Mon 08:00 Manila
    $this->staff = User::factory()->create(['role' => 'staff']);
});
afterEach(fn () => Carbon::setTestNow());

function approvedBooking(string $sacrament = 'baptism', array $attrs = [], string $date = '2026-10-10'): Booking
{
    return Booking::factory()->scheduled($date, '10:00', '11:00')->create($attrs + ['sacrament' => $sacrament, 'status' => 'approved']);
}

test('completing a baptism creates one entry with a frozen snapshot', function () {
    $owner = User::factory()->create();
    $booking = approvedBooking('baptism', ['user_id' => $owner->id, 'form_data' => formDataFixture('baptism/valid-basic', $owner->id)]);

    $this->actingAs($this->staff)->patchJson("/api/admin/bookings/{$booking->id}/complete")->assertOk();

    $entry = RegisterEntry::where('booking_id', $booking->id)->sole();
    expect($entry->register_number)->toBe('BAP-2026-0001')
        ->and($entry->year)->toBe(2026)->and($entry->sequence)->toBe(1)
        ->and($entry->source)->toBe('system')->and($entry->status)->toBe('valid')
        ->and($entry->subject_name)->toBe($booking->subjectName())
        ->and($entry->ceremony_date->toDateString())->toBe('2026-10-10')
        ->and($entry->entered_by)->toBe($this->staff->id)
        ->and(strlen($entry->verify_code))->toBe(12)
        ->and(strspn($entry->verify_code, ParishRegister::CODE_ALPHABET))->toBe(12)
        ->and($entry->snapshot)->toHaveKeys(['subjectName', 'ceremonyDate', 'minister', 'parishName', 'parishAddress', 'title', 'statement', 'details'])
        ->and($entry->snapshot['ceremonyDate'])->toBe('2026-10-10')
        ->and($entry->snapshot['minister'])->toBe('Rev. Fr. Leopoldo S. Evangelista')
        ->and($entry->snapshot['parishAddress'])->toBe('Balagtas, Bulacan');
});

test('the snapshot holds what the old certificate showed for each sacrament', function (string $sacrament, string $fixture, string $subject, string $statementPart, array $details) {
    $owner = User::factory()->create(['full_name' => 'Account Holder']);
    $booking = approvedBooking($sacrament, ['user_id' => $owner->id, 'form_data' => formDataFixture($fixture, $owner->id)]);
    if ($sacrament === 'wedding') {
        completeWeddingPreparation($booking); // a wedding is completed only once its preparation is on record
    }

    $this->actingAs($this->staff)->patchJson("/api/admin/bookings/{$booking->id}/complete")->assertOk();

    $snap =RegisterEntry::where('booking_id', $booking->id)->sole()->snapshot;
    expect($snap['subjectName'])->toBe($subject)
        ->and($snap['statement'])->toContain($statementPart)->toContain('October 10, 2026')
        ->and($snap['details'])->each->toHaveKeys(['label', 'value']);
    $map = collect($snap['details'])->pluck('value', 'label')->all();
    foreach ($details as $label => $value) {
        expect($map)->toHaveKey($label)->and($map[$label])->toContain($value);
    }
})->with([
    ['baptism', 'baptism/valid-basic', 'José Miguel Ñiguez Dela Cruz-Santos Jr.', 'was baptized', ['Mother' => 'Ma. Teresa Ñiguez', 'Godparents' => 'Pedro Reyes, Liza Soriano', 'Date of Baptism' => 'October 10, 2026']],
    ['confirmation', 'confirmation/valid-basic', 'Andrea Villanueva', 'received the Sacrament of Confirmation', ['Father' => 'Ramon Villanueva', 'Mother' => 'Celia Ramos']],
    ['wedding', 'wedding/valid-basic', 'Mark Anthony Garcia & Kristine Joy Bautista', 'were united in Holy Matrimony', ['Groom' => 'Mark Anthony Garcia', 'Bride' => 'Kristine Joy Bautista']],
    ['funeral', 'funeral/valid-basic', 'Lorenzo Pascual', 'was commended to God', ['Place of Burial' => 'Balagtas Public Cemetery', 'Funeral Mass' => 'House Mass']],
    ['anointing', 'anointing/valid-hospital', 'Consolacion Aquino', 'received the Sacrament of the Anointing of the Sick', ['Place' => 'Bulacan Medical Center']],
    ['house-blessing', 'house-blessing/valid-house', 'Ricardo Dalisay', 'was blessed', ['Address / Plate No.' => 'Wawa, Balagtas, Bulacan']],
]);

test('an emergency anointing with no appointment uses the parish date and has no verification code', function () {
    $booking = Booking::factory()->create(['sacrament' => 'anointing', 'status' => 'approved', 'is_emergency' => true]);

    $this->actingAs($this->staff)->patchJson("/api/admin/bookings/{$booking->id}/complete")->assertOk();

    $entry = RegisterEntry::where('booking_id', $booking->id)->sole();
    expect($entry->register_number)->toBe('ANO-2026-0001')
        ->and($entry->ceremony_date->toDateString())->toBe('2026-11-02')
        ->and($entry->verify_code)->toBeNull();
});

test('a fixed-code record (the demo seeder) gets the same verification code on every fresh run', function () {
    $code = function () {
        $booking = approvedBooking('baptism', ['reference_number' => 'DEMO-BAPT']);
        $entry = app(ParishRegister::class)->record($booking, $this->staff, fixedCode: true);
        $code = $entry->verify_code;
        $entry->delete();
        $booking->delete();

        return $code;
    };

    $first = $code();
    expect($first)->toHaveLength(12)->and(strspn($first, ParishRegister::CODE_ALPHABET))->toBe(12)
        ->and($code())->toBe($first);
});

test('a service id the list does not know records under SVC without failing the completion', function () {
    Service::create(['id' => 'mystery', 'sacrament' => 'mystery', 'name' => 'Mystery Rite', 'description' => 'x', 'price_centavos' => 0]);
    $booking = approvedBooking('mystery');

    $this->actingAs($this->staff)->patchJson("/api/admin/bookings/{$booking->id}/complete")->assertOk();

    $entry = RegisterEntry::where('booking_id', $booking->id)->sole();
    expect($entry->register_number)->toBe('SVC-2026-0001')
        ->and($entry->snapshot['title'])->toBeString()->and($entry->snapshot['statement'])->toBeString();
});

test('recording twice keeps one entry and one number', function () {
    $booking = approvedBooking();
    $register = app(ParishRegister::class);

    $a = $register->record($booking, $this->staff);
    $b = $register->record($booking, $this->staff);

    expect($b->id)->toBe($a->id)->and(RegisterEntry::count())->toBe(1);
    expect(AuditLog::where('action', 'register.recorded')->count())->toBe(1);
    expect(DB::transaction(fn () => $register->nextNumber('baptism', 2026))['number'])->toBe('BAP-2026-0002');
});

test('if the entry cannot be recorded the booking is not completed', function () {
    // The register's own audit row is written inside the entry's transaction; make it fail.
    $broken = Mockery::mock(AuditTrail::class);
    $broken->shouldReceive('record')->andThrow(new RuntimeException('boom'));
    app()->instance(AuditTrail::class, $broken);
    $booking = approvedBooking();

    $this->withoutExceptionHandling();
    try {
        $this->actingAs($this->staff)->patchJson("/api/admin/bookings/{$booking->id}/complete");
    } catch (RuntimeException) {
    }

    expect($booking->fresh()->status->value)->toBe('approved')
        ->and(AuditLog::where('action', 'booking.completed')->count())->toBe(0)
        ->and(AppNotification::count())->toBe(0);
});

test('a walk-in with no account and a booking whose user was deleted both get entries', function () {
    $walkIn = Booking::factory()->walkIn($this->staff, ['fullName' => 'Walk In Person'])->scheduled('2026-10-10', '10:00', '11:00')
        ->create(['sacrament' => 'baptism', 'status' => 'approved']);
    $this->actingAs($this->staff)->patchJson("/api/admin/bookings/{$walkIn->id}/complete")->assertOk();
    expect(RegisterEntry::where('booking_id', $walkIn->id)->sole()->subject_name)->toBe('Walk In Person');

    $owner = User::factory()->create(['full_name' => 'Gone Soon']);
    $orphan = approvedBooking('confirmation', ['user_id' => $owner->id, 'owner_snapshot' => ['fullName' => 'Gone Soon', 'email' => null, 'phone' => null]]);
    $owner->delete();
    $this->actingAs($this->staff)->patchJson("/api/admin/bookings/{$orphan->id}/complete")->assertOk();
    expect(RegisterEntry::where('booking_id', $orphan->id)->sole()->subject_name)->toBe('Gone Soon');
});

test('a later change to the parish settings never rewrites an existing snapshot', function () {
    $booking = approvedBooking();
    $this->actingAs($this->staff)->patchJson("/api/admin/bookings/{$booking->id}/complete")->assertOk();

    ParishSetting::put('priest_name', 'Rev. Fr. Someone Else');
    ParishSetting::put('parish_name', 'Another Parish');
    ParishSetting::put('parish_address', 'Elsewhere');

    $snap = RegisterEntry::where('booking_id', $booking->id)->sole()->fresh()->snapshot;
    expect($snap['minister'])->toBe('Rev. Fr. Leopoldo S. Evangelista')
        ->and($snap['parishName'])->toBe('St. Peter the Apostle Parish')
        ->and($snap['parishAddress'])->toBe('Balagtas, Bulacan');
});

test('completing writes the audit row and tells the owner the certificate number', function () {
    $owner = User::factory()->create();
    $booking = approvedBooking('baptism', ['user_id' => $owner->id]);

    $this->actingAs($this->staff)->patchJson("/api/admin/bookings/{$booking->id}/complete")->assertOk();

    $log = AuditLog::where('action', 'register.recorded')->sole();
    expect($log->subject_type)->toBe('register_entry')
        ->and($log->metadata['registerNumber'])->toBe('BAP-2026-0001');

    $n = AppNotification::where('user_id', $owner->id)->sole();
    expect($n->title)->toBe('Sacrament recorded')
        ->and($n->body)->toBe("Your Baptism ({$booking->reference_number}) is complete. Your certificate BAP-2026-0001 is ready to view.");
});

test('both booking resources expose registerEntry, null until completed', function () {
    $owner = User::factory()->create();
    $booking = approvedBooking('baptism', ['user_id' => $owner->id]);

    $this->actingAs($owner)->getJson("/api/bookings/{$booking->id}")->assertOk()->assertJsonPath('registerEntry', null);
    $this->actingAs($this->staff)->getJson("/api/admin/bookings/{$booking->id}")->assertOk()->assertJsonPath('registerEntry', null);

    $this->actingAs($this->staff)->patchJson("/api/admin/bookings/{$booking->id}/complete")->assertOk();
    $entry = RegisterEntry::where('booking_id', $booking->id)->sole();

    foreach ([[$owner, "/api/bookings/{$booking->id}"], [$this->staff, "/api/admin/bookings/{$booking->id}"]] as [$who, $url]) {
        $this->actingAs($who)->getJson($url)->assertOk()
            ->assertJsonPath('registerEntry.id', $entry->id)
            ->assertJsonPath('registerEntry.registerNumber', 'BAP-2026-0001')
            ->assertJsonPath('registerEntry.status', 'valid')
            ->assertJsonPath('registerEntry.enteredAt', $entry->created_at->toISOString());
    }
    $this->actingAs($owner)->getJson('/api/bookings')->assertOk()->assertJsonPath('0.registerEntry.registerNumber', 'BAP-2026-0001');
});

// The certificate printed "Date of Birth 2026-07-14" beside "Date of Baptism October 10, 2026".
test('dates the family typed are written out in full on the certificate, like the ceremony date', function (string $sacrament, string $fixture, string $label, string $key, string $typed, string $shown) {
    $owner = User::factory()->create();
    $form = formDataFixture($fixture, $owner->id);
    $form[$key] = $typed;
    $booking = approvedBooking($sacrament, ['user_id' => $owner->id, 'form_data' => $form]);

    $this->actingAs($this->staff)->patchJson("/api/admin/bookings/{$booking->id}/complete")->assertOk();

    $map = collect(RegisterEntry::where('booking_id', $booking->id)->sole()->snapshot['details'])->pluck('value', 'label')->all();
    expect($map[$label])->toBe($shown);
})->with([
    ['baptism', 'baptism/valid-basic', 'Date of Birth', 'childDateOfBirth', '2026-07-14', 'July 14, 2026'],
    ['confirmation', 'confirmation/valid-basic', 'Date of Birth', 'confirmandDateOfBirth', '2012-03-05', 'March 5, 2012'],
    ['funeral', 'funeral/valid-basic', 'Date of Death', 'deceasedDateOfDeath', '2026-10-01', 'October 1, 2026'],
    'a value that is not a date is left as typed' => ['funeral', 'funeral/valid-basic', 'Date of Death', 'deceasedDateOfDeath', 'early October', 'early October'],
]);

test('only the demo seeder gets a fixed code: a real booking with a DEMO- reference does not', function () {
    $derived = function (string $reference) {
        $code = '';
        foreach (str_split(substr(hash('sha256', $reference, true), 0, 12)) as $byte) {
            $code .= ParishRegister::CODE_ALPHABET[ord($byte) % strlen(ParishRegister::CODE_ALPHABET)];
        }

        return $code;
    };
    $owner = User::factory()->create();
    $real = approvedBooking('baptism', ['user_id' => $owner->id, 'reference_number' => 'DEMO-REAL', 'form_data' => formDataFixture('baptism/valid-basic', $owner->id)]);
    $seeded = approvedBooking('baptism', ['user_id' => $owner->id, 'reference_number' => 'DEMO-SEED', 'appointment_start' => '14:00', 'form_data' => formDataFixture('baptism/valid-basic', $owner->id)]);

    $register = app(ParishRegister::class);

    expect($register->record($real, null)->verify_code)->not->toBe($derived('DEMO-REAL'))
        ->and($register->record($seeded, null, null, fixedCode: true)->verify_code)->toBe($derived('DEMO-SEED'));
});
