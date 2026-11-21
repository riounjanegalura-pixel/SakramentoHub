<?php

use App\Models\Booking;
use App\Models\RegisterEntry;
use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Database\Seeders\ParishSettingSeeder;
use Database\Seeders\ServiceSeeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Storage;

beforeEach(function () {
    Storage::fake('local');
    Carbon::setTestNow(Carbon::parse('2026-11-02 00:00:00', 'UTC'));
});
afterEach(fn () => Carbon::setTestNow());

function completedWithoutEntry(string $reference, string $date, string $sacrament = 'baptism'): Booking
{
    return Booking::factory()->scheduled($date, '10:00', '11:00')->create([
        'reference_number' => $reference, 'sacrament' => $sacrament, 'status' => 'completed',
    ]);
}

test('backfill records completed bookings in ceremony-date order with consecutive numbers', function () {
    $this->seed(ServiceSeeder::class);
    $this->seed(ParishSettingSeeder::class);
    $late = completedWithoutEntry('SAC-B', '2026-09-20');
    $early = completedWithoutEntry('SAC-A', '2026-03-01');
    $sameDay = completedWithoutEntry('SAC-C', '2026-03-01');

    $this->artisan('register:backfill')->expectsOutputToContain('Recorded 3 register entries')->assertSuccessful();

    $number = fn (Booking $b) => RegisterEntry::where('booking_id', $b->id)->value('register_number');
    expect($number($early))->toBe('BAP-2026-0001')
        ->and($number($sameDay))->toBe('BAP-2026-0002')
        ->and($number($late))->toBe('BAP-2026-0003')
        ->and(RegisterEntry::whereNotNull('entered_by')->count())->toBe(0);
});

test('backfill is idempotent and skips bookings that are not completed', function () {
    $this->seed(ServiceSeeder::class);
    $this->seed(ParishSettingSeeder::class);
    completedWithoutEntry('SAC-A', '2026-03-01');
    Booking::factory()->scheduled('2026-03-02', '10:00', '11:00')->create(['sacrament' => 'baptism', 'status' => 'approved']);

    $this->artisan('register:backfill')->expectsOutputToContain('Recorded 1 register entry')->assertSuccessful();
    $this->artisan('register:backfill')->expectsOutputToContain('Recorded 0 register entries')->assertSuccessful();

    expect(RegisterEntry::count())->toBe(1);
});

test('a seeded database holds exactly one entry for each completed demo booking, with a fixed code', function () {
    $this->seed(DatabaseSeeder::class);
    $this->artisan('register:backfill')->expectsOutputToContain('Recorded 0 register entries')->assertSuccessful();

    $done = Booking::where('reference_number', 'DEMO-FUNE')->sole();
    $entry = RegisterEntry::where('booking_id', $done->id)->sole();
    expect(RegisterEntry::count())->toBe(2) // DEMO-FUNE and DEMO-DONE
        ->and($entry->source)->toBe('system')->and($entry->entered_by)->toBeNull()
        ->and($entry->register_number)->toStartWith('DEA-2026-');
    $code = $entry->verify_code;

    // A second fresh database: same code, so a printed demo certificate still verifies after a redeploy.
    RegisterEntry::query()->delete();
    Booking::where('reference_number', 'like', 'DEMO-%')->delete();
    \Illuminate\Support\Facades\DB::table('register_sequences')->delete();
    $this->seed(DatabaseSeeder::class);

    expect(RegisterEntry::where('booking_id', Booking::where('reference_number', 'DEMO-FUNE')->value('id'))->sole()->verify_code)->toBe($code);
});

test('re-seeding does not create a second entry', function () {
    $this->seed(DatabaseSeeder::class);
    $numbers = RegisterEntry::orderBy('register_number')->pluck('register_number')->all();

    $this->seed(DatabaseSeeder::class);

    expect(RegisterEntry::count())->toBe(2)->and(RegisterEntry::orderBy('register_number')->pluck('register_number')->all())->toBe($numbers);
});

test('re-seeding records the entry for a completed demo booking that has none yet', function () {
    $this->seed(DatabaseSeeder::class);
    RegisterEntry::query()->delete();

    $this->seed(DatabaseSeeder::class);

    expect(RegisterEntry::count())->toBe(2);
});

test('a backfilled emergency anointing takes the parish date of its completion, not today', function () {
    $this->seed(ServiceSeeder::class);
    $this->seed(ParishSettingSeeder::class);
    $make = fn (string $reference, string $updatedAt) => tap(
        Booking::factory()->create(['reference_number' => $reference, 'sacrament' => 'anointing', 'status' => 'completed', 'appointment_date' => null]),
        fn (Booking $b) => \Illuminate\Support\Facades\DB::table('bookings')->where('id', $b->id)->update(['updated_at' => $updatedAt]),
    );
    // 22:00 UTC on the 28th is already the 29th in Manila.
    $recent = $make('SAC-ANO-1', '2026-10-28 22:00:00');
    $lastYear = $make('SAC-ANO-2', '2025-12-30 10:00:00');

    $this->artisan('register:backfill')->assertSuccessful();

    $recentEntry = RegisterEntry::where('booking_id', $recent->id)->sole();
    $oldEntry = RegisterEntry::where('booking_id', $lastYear->id)->sole();
    expect($recentEntry->ceremony_date->toDateString())->toBe('2026-10-29')
        ->and($recentEntry->year)->toBe(2026)
        ->and($oldEntry->ceremony_date->toDateString())->toBe('2025-12-30')
        ->and($oldEntry->year)->toBe(2025)
        ->and($oldEntry->register_number)->toBe('ANO-2025-0001');
});
