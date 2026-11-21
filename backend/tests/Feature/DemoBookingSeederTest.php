<?php

use App\Models\Booking;
use App\Models\Service;
use App\Services\Scheduling\AppointmentRequest;
use App\Services\Scheduling\SchedulingService;
use App\Support\ParishClock;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Storage;

beforeEach(fn () => Storage::fake('local'));

afterEach(fn () => Carbon::setTestNow());

// An ordinary day, a day just before Holy Week 2027 (Triduum Mar 25–27), and
// 23:30 UTC — already the next parish day in Manila.
dataset('seed days', [
    'ordinary day' => ['2026-11-02 00:00:00'],
    'before Holy Week' => ['2027-03-14 02:00:00'],
    'late UTC evening' => ['2026-12-05 23:30:00'],
]);

test('every future demo booking sits in a slot the scheduler accepts', function (string $utcNow) {
    Carbon::setTestNow(Carbon::parse($utcNow, 'UTC'));
    $this->seed(DatabaseSeeder::class);

    $bookings = Booking::where('reference_number', 'like', 'DEMO-%')->get();
    expect($bookings)->toHaveCount(8)
        ->and($bookings->pluck('sacrament')->sort()->values()->all())
        ->toBe(['anointing', 'baptism', 'baptism', 'confirmation', 'funeral', 'house-blessing', 'house-blessing', 'wedding']);

    $scheduling = app(SchedulingService::class);
    $future = $bookings->filter(fn (Booking $b) => $b->appointmentDateString() >= ParishClock::todayString());
    expect($future)->toHaveCount(6);

    foreach ($future as $booking) {
        $request = AppointmentRequest::make(
            Service::findOrFail($booking->sacrament),
            $booking->appointmentDateString(),
            $booking->appointment_start,
            $booking->form_data,
        );

        expect($scheduling->check($request, $booking->id))
            ->toBeNull("{$booking->reference_number} on {$request->date} {$request->start}")
            ->and($booking->appointment_end)->toBe($scheduling->endFor($request));
    }

    $baptism = $bookings->firstWhere('reference_number', 'DEMO-BAPT');
    expect(Carbon::parse($baptism->appointmentDateString())->dayOfWeekIso)->toBe(7)
        ->and($baptism->appointment_start)->toBe('10:00');
})->with('seed days');

test('the demo seeder is idempotent', function () {
    Carbon::setTestNow(Carbon::parse('2026-11-02 00:00:00', 'UTC'));
    $this->seed(DatabaseSeeder::class);
    $first = Booking::orderBy('reference_number')->get(['reference_number', 'appointment_date', 'appointment_start'])->toArray();

    $this->seed(DatabaseSeeder::class);

    expect(Booking::count())->toBe(8)
        ->and(Booking::orderBy('reference_number')->get(['reference_number', 'appointment_date', 'appointment_start'])->toArray())->toBe($first);
});

// The container re-seeds on every boot: a demo booking staff have already
// acted on must stay as they left it, and only a missing one is recreated.
test('re-seeding leaves existing demo bookings alone and restores a missing one', function () {
    Carbon::setTestNow(Carbon::parse('2026-11-02 00:00:00', 'UTC'));
    $this->seed(DatabaseSeeder::class);
    Booking::where('reference_number', 'DEMO-WEDD')->update([
        'status' => 'cancelled', 'payment_status' => 'void', 'status_reason' => 'Cancelled by staff', 'payment_hold_expires_at' => null,
    ]);
    Booking::where('reference_number', 'DEMO-HOUS')->delete();

    Carbon::setTestNow(Carbon::parse('2026-11-09 00:00:00', 'UTC'));
    $this->seed(DatabaseSeeder::class);

    $wedding = Booking::where('reference_number', 'DEMO-WEDD')->first();
    expect(Booking::count())->toBe(8)
        ->and($wedding->status->value)->toBe('cancelled')
        ->and($wedding->status_reason)->toBe('Cancelled by staff')
        ->and(Booking::where('reference_number', 'DEMO-HOUS')->exists())->toBeTrue();
});

test('a demo booking with no free slot in the window is logged and skipped, not thrown', function () {
    Carbon::setTestNow(Carbon::parse('2026-11-02 00:00:00', 'UTC'));
    $day = ParishClock::today();
    for ($i = 0; $i <= 400; $i++) {
        App\Models\BlackoutDate::create(['date' => $day->addDays($i)->toDateString(), 'reason' => 'Closed', 'sacraments' => ['confirmation']]);
    }
    Illuminate\Support\Facades\Log::spy();

    $this->seed(DatabaseSeeder::class);

    expect(Booking::where('reference_number', 'like', 'DEMO-%')->count())->toBe(7)
        ->and(Booking::where('reference_number', 'DEMO-CONF')->exists())->toBeFalse();
    Illuminate\Support\Facades\Log::shouldHaveReceived('warning')
        ->withArgs(fn (string $message) => str_contains($message, 'DEMO-CONF'))
        ->once();
});

test('the returned demo booking can be resubmitted with the slot it holds', function () {
    Carbon::setTestNow(Carbon::parse('2026-11-02 00:00:00', 'UTC'));
    $this->seed(DatabaseSeeder::class);
    $returned = Booking::where('reference_number', 'DEMO-CONF')->first();
    $returned->user->forceFill(['email_verified_at' => now()])->save();

    Carbon::setTestNow(now()->addDays(6)); // now inside the 14-day lead time
    $resubmitted = app(App\Services\Booking\BookingStateMachine::class)->submit($returned, $returned->user);

    expect($resubmitted->status->value)->toBe('submitted');
});

// The deployed image holds only backend/, so the seeder reads its own copies
// of the shared fixtures. They must not drift from the contract.
test('each bundled demo fixture matches its contracts source', function (string $name) {
    $source = base_path("../contracts/fixtures/{$name}.json");
    if (! is_file($source)) {
        $this->markTestSkipped('contracts/fixtures is not present in this checkout.');
    }

    $copy = database_path("seeders/demo/{$name}.json");
    expect(is_file($copy))->toBeTrue("missing {$copy}")
        ->and(json_decode(file_get_contents($copy), true))->toBe(json_decode(file_get_contents($source), true));
})->with(Database\Seeders\DemoBookingSeeder::FIXTURES);

test('the demo seeder never reads outside the backend directory', function () {
    expect(file_get_contents(database_path('seeders/DemoBookingSeeder.php')))->not->toContain("'../contracts")->not->toContain('"../contracts');
});

test('a demo booking whose hold lapsed is re-created on the next seed', function () {
    $this->seed(DatabaseSeeder::class);
    $wedding = Booking::where('reference_number', 'DEMO-WEDD')->firstOrFail();
    $oldId = $wedding->id;
    $wedding->update(['status' => 'cancelled', 'payment_status' => 'void', 'status_reason' => 'Payment not completed within 48 hours.']);

    $this->seed(Database\Seeders\DemoBookingSeeder::class);

    $fresh = Booking::where('reference_number', 'DEMO-WEDD')->firstOrFail();
    expect($fresh->id)->not->toBe($oldId)->and($fresh->status->value)->toBe('submitted')
        ->and($fresh->payment_hold_expires_at->isFuture())->toBeTrue();
});

test('an appointment that has passed is moved forward on the next seed', function () {
    $this->seed(DatabaseSeeder::class);
    Booking::where('reference_number', 'DEMO-BAPT')->update(['appointment_date' => ParishClock::today()->subDays(2)->toDateString()]);

    $this->seed(Database\Seeders\DemoBookingSeeder::class);

    expect(Booking::where('reference_number', 'DEMO-BAPT')->first()->appointmentDateString())
        ->toBeGreaterThan(ParishClock::todayString());
});

test('a demo booking staff changed is left alone', function () {
    $this->seed(DatabaseSeeder::class);
    $b = Booking::where('reference_number', 'DEMO-HOUS')->firstOrFail(); // declined
    $b->update(['status_reason' => 'Edited by staff']);
    $this->seed(Database\Seeders\DemoBookingSeeder::class);
    expect($b->fresh()->status_reason)->toBe('Edited by staff');
});

test('approved and completed demo bookings have accepted documents', function () {
    $this->seed(DatabaseSeeder::class);
    foreach (['DEMO-BAPT', 'DEMO-FUNE', 'DEMO-DONE'] as $ref) {
        expect(Booking::where('reference_number', $ref)->firstOrFail()->documentsCleared())->toBeTrue();
    }
});

test('the demo data includes a walk-in', function () {
    $this->seed(DatabaseSeeder::class);
    $walk = Booking::where('reference_number', 'DEMO-WALK')->firstOrFail();
    expect($walk->channel)->toBe('walk_in')->and($walk->user_id)->toBeNull()
        ->and($walk->ownerName())->toBe('Aling Rosa Dela Cruz')->and($walk->created_by)->not->toBeNull()
        ->and($walk->status->value)->toBe('approved');
});

// Demos need a verifiable baptism certificate whose number and code survive a reset.
test('DEMO-DONE is a completed baptism for the demo parishioner, 30 days in the past, with a register entry', function () {
    Carbon::setTestNow(Carbon::parse('2026-11-02 00:00:00', 'UTC'));
    $this->seed(DatabaseSeeder::class);

    $done = Booking::where('reference_number', 'DEMO-DONE')->firstOrFail();
    $entry = App\Models\RegisterEntry::where('booking_id', $done->id)->sole();

    expect($done->sacrament)->toBe('baptism')->and($done->status->value)->toBe('completed')
        ->and($done->user->email)->toBe('test@example.com')
        ->and($done->appointmentDateString())->toBe(ParishClock::today()->subDays(30)->toDateString())
        ->and($entry->register_number)->toStartWith('BAP-2026-')
        ->and($entry->source)->toBe('system')->and($entry->status)->toBe('valid')
        ->and($entry->verify_code)->not->toBeNull();
});

test('a completed demo booking is never treated as lapsed, however old', function () {
    Carbon::setTestNow(Carbon::parse('2026-11-02 00:00:00', 'UTC'));
    $this->seed(DatabaseSeeder::class);
    $id = Booking::where('reference_number', 'DEMO-DONE')->value('id');

    Carbon::setTestNow(Carbon::parse('2027-03-02 00:00:00', 'UTC'));
    $this->seed(DatabaseSeeder::class);

    expect(Booking::where('reference_number', 'DEMO-DONE')->value('id'))->toBe($id)
        ->and(App\Models\RegisterEntry::where('booking_id', $id)->count())->toBe(1);
});

test('two fresh seeds give DEMO-DONE the same register number and code, and /verify accepts them', function () {
    Carbon::setTestNow(Carbon::parse('2026-11-02 00:00:00', 'UTC'));
    $seedAndRead = function () {
        $this->seed(DatabaseSeeder::class);
        $entry = App\Models\RegisterEntry::where('booking_id', Booking::where('reference_number', 'DEMO-DONE')->value('id'))->sole();

        return [$entry->register_number, $entry->verify_code];
    };

    $first = $seedAndRead();

    App\Models\RegisterEntry::query()->delete();
    Booking::query()->delete();
    Illuminate\Support\Facades\DB::table('register_sequences')->delete();
    $second = $seedAndRead();

    expect($second)->toBe($first);
    $this->postJson('/api/verify', ['number' => $first[0], 'code' => App\Services\Register\ParishRegister::formatCode($first[1])])
        ->assertOk()->assertJsonPath('status', 'valid')->assertJsonPath('sacrament', 'Baptism');
});
