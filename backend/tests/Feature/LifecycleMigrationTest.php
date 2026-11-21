<?php
// Verifies the data-moving migration against legacy row shapes. Rolls the
// last migration back, inserts legacy rows, re-runs it.

use Database\Seeders\ServiceSeeder;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

beforeEach(fn () => $this->seed(ServiceSeeder::class));

function insertLegacyBooking(array $overrides): string
{
    $id = (string) Str::uuid();
    DB::table('bookings')->insert(array_merge([
        'id' => $id,
        'user_id' => null,
        'sacrament' => 'wedding',
        'status' => 'submitted',
        'form_data' => '{}',
        'payment_method' => 'gcash',
        'receipt_url' => null,
        'rejection_reason' => null,
        'payment_status' => null,
        'amount_due_centavos' => null,
        'reference_number' => 'WEDD-'.Str::random(6),
        'created_at' => now(),
        'updated_at' => now(),
    ], $overrides));

    return $id;
}

const LIFECYCLE_MIGRATION = 'database/migrations/2026_10_03_000300_restructure_bookings_lifecycle.php';
// Brings payment_method back later; rolled back first so the lifecycle down() can re-add the legacy column.
const CASH_PAYMENT_MIGRATION = 'database/migrations/2026_10_29_000100_add_cash_payment_to_bookings.php';

test('moves legacy appointment values into columns and normalizes statuses', function () {
    // --path, not --step: later tasks add newer migrations, so "the last one"
    // must not be assumed to be this one.
    Artisan::call('migrate:rollback', ['--path' => CASH_PAYMENT_MIGRATION]);
    Artisan::call('migrate:rollback', ['--path' => LIFECYCLE_MIGRATION]);

    $iso = insertLegacyBooking(['form_data' => json_encode(['appointmentDate' => '2026-11-05', 'appointmentTime' => '10:00'])]);
    $isoZ = insertLegacyBooking(['form_data' => json_encode(['appointmentDate' => '2026-11-06T00:00:00.000Z', 'appointmentTime' => '2:30 PM'])]);
    $missing = insertLegacyBooking(['form_data' => json_encode(['scheduleType' => 'regular'])]);
    $rejected = insertLegacyBooking(['status' => 'rejected', 'rejection_reason' => 'Incomplete documents']);
    $pending = insertLegacyBooking(['payment_status' => 'pending', 'amount_due_centavos' => 500000]);
    $legacyPaid = insertLegacyBooking(['status' => 'approved', 'payment_status' => null]);
    $closedPending = insertLegacyBooking(['status' => 'cancelled', 'payment_status' => 'pending', 'amount_due_centavos' => 500000]);
    $paid = insertLegacyBooking(['payment_status' => 'paid', 'amount_due_centavos' => 500000]);

    Illuminate\Support\Carbon::setTestNow('2026-11-02 00:00:00');

    Artisan::call('migrate', ['--path' => LIFECYCLE_MIGRATION]);
    Artisan::call('migrate', ['--path' => CASH_PAYMENT_MIGRATION]);

    $row = fn ($id) => DB::table('bookings')->find($id);

    expect($row($iso)->appointment_date)->toStartWith('2026-11-05')
        ->and($row($iso)->appointment_start)->toBe('10:00')
        ->and($row($iso)->appointment_end)->toBe('11:30') // wedding = 90 min
        ->and(json_decode($row($iso)->form_data, true))->not->toHaveKey('appointmentDate');

    expect($row($isoZ)->appointment_date)->toStartWith('2026-11-06')
        ->and($row($isoZ)->appointment_start)->toBe('14:30');

    expect($row($missing)->appointment_date)->toBeNull()
        ->and($row($missing)->appointment_start)->toBeNull();

    expect($row($rejected)->status)->toBe('declined')
        ->and($row($rejected)->status_reason)->toBe('Incomplete documents');

    expect($row($pending)->payment_status)->toBe('unpaid');

    // A legacy submitted + pending booking gets a fresh 48-hour payment hold:
    // without one it would hold its slot forever and could never be paid.
    expect($row($pending)->payment_hold_expires_at)->toStartWith('2026-11-04 00:00:00')
        ->and($row($closedPending)->payment_status)->toBe('unpaid')
        ->and($row($closedPending)->payment_hold_expires_at)->toBeNull()
        ->and($row($paid)->payment_hold_expires_at)->toBeNull()
        ->and($row($iso)->payment_hold_expires_at)->toBeNull();

    $migrated = App\Models\Booking::find($pending);
    expect($migrated->payment_hold_expires_at->isFuture())->toBeTrue()
        ->and(App\Models\Booking::holdingSlot()->whereKey($pending)->exists())->toBeTrue();
    Illuminate\Support\Carbon::setTestNow(now()->addHours(49));
    expect(App\Models\Booking::holdingSlot()->whereKey($pending)->exists())->toBeFalse();
    Illuminate\Support\Carbon::setTestNow();
    expect($row($legacyPaid)->payment_status)->toBe('not_required');
});
