<?php

use App\Models\AuditLog;
use App\Models\BlackoutDate;
use App\Models\Booking;
use App\Models\ParishSetting;
use App\Models\Service;
use App\Models\User;
use Database\Seeders\ServiceSeeder;

beforeEach(function () {
    $this->seed(\Database\Seeders\ServiceSeeder::class);
    $this->seed(\Database\Seeders\ParishSettingSeeder::class);
    \Illuminate\Support\Carbon::setTestNow(\Illuminate\Support\Carbon::parse('2026-11-02 00:00:00', 'UTC')); // Mon 08:00 Manila
    \Illuminate\Support\Facades\Storage::fake('local');
    $this->staff = \App\Models\User::factory()->create(['role' => 'staff']);
    $this->admin = \App\Models\User::factory()->create(['role' => 'admin']);
});
afterEach(fn () => \Illuminate\Support\Carbon::setTestNow());

test('staff can read settings', function () {
    $this->actingAs($this->staff)->getJson('/api/admin/settings')->assertOk()
        ->assertJsonPath('parish.workingHoursStart', '08:00')->assertJsonPath('policy.paymentHoldHours', 48)
        ->assertJsonPath('policy.changeCutoffDays', 3)->assertJsonCount(6, 'services')->assertJsonCount(6, 'triduum');
});

test('only admin can change parish settings, and the change is audited', function () {
    $this->actingAs($this->staff)->patchJson('/api/admin/settings/parish', ['priestName' => 'Rev. Fr. New Priest'])->assertForbidden();
    $this->actingAs($this->admin)->patchJson('/api/admin/settings/parish', ['priestName' => 'Rev. Fr. New Priest', 'travelBufferMinutes' => 45])
        ->assertOk()->assertJsonPath('priestName', 'Rev. Fr. New Priest')->assertJsonPath('travelBufferMinutes', 45);
    expect(ParishSetting::priestName())->toBe('Rev. Fr. New Priest');

    $meta = AuditLog::where('action', 'settings.parish_updated')->first()->metadata;
    expect($meta['before']['travelBufferMinutes'])->toBe(30)->and($meta['after']['travelBufferMinutes'])->toBe(45)
        ->and($meta['before'])->not->toHaveKey('parishPhone');
});

test('parish settings are validated', function (array $payload, string $field) {
    $this->actingAs($this->admin)->patchJson('/api/admin/settings/parish', $payload)->assertUnprocessable()->assertJsonValidationErrors([$field]);
})->with([
    [['slotStepMinutes' => 20], 'slotStepMinutes'],
    [['travelBufferMinutes' => 200], 'travelBufferMinutes'],
    [['workingHoursEnd' => '07:00'], 'workingHoursEnd'], // before the stored 08:00 start
    [['workingHoursStart' => '18:00'], 'workingHoursStart'], // after the stored 17:00 end
    [['parishPhone' => 'call us'], 'parishPhone'],
    [['priestName' => ''], 'priestName'],
    [['slotGapMinutes' => 90], 'slotGapMinutes'],
    [['massBufferMinutes' => 500], 'massBufferMinutes'],
    [['officeDays' => []], 'officeDays'],
    [['officeDays' => [0, 8]], 'officeDays.0'],
    [['parishEmail' => 'not an email'], 'parishEmail'],
]);

test('the office hours, email, gaps and buffer are settings the public parish record shows', function () {
    $this->actingAs($this->admin)->patchJson('/api/admin/settings/parish', [
        'officeDays' => [1, 2, 3], 'parishEmail' => 'office@example.org', 'slotGapMinutes' => 10, 'massBufferMinutes' => 20,
    ])->assertOk()->assertJsonPath('officeDays', [1, 2, 3])->assertJsonPath('parishEmail', 'office@example.org')
        ->assertJsonPath('slotGapMinutes', 10)->assertJsonPath('massBufferMinutes', 20);

    $this->getJson('/api/parish')->assertOk()->assertJsonPath('officeDays', [1, 2, 3])->assertJsonPath('email', 'office@example.org');
});

test('a fresh parish record has office days and no made-up email', function () {
    $this->getJson('/api/parish')->assertOk()->assertJsonPath('officeDays', [2, 3, 4, 5, 6])->assertJsonPath('email', null);
    expect(ParishSetting::slotGapMinutes())->toBe(0)->and(ParishSetting::massBufferMinutes())->toBe(15);
});

test('admin edits a service and the scheduler obeys it', function () {
    $this->actingAs($this->admin)->patchJson('/api/admin/settings/services/house-blessing', ['leadTimeDays' => 0, 'allowedWeekdays' => [1, 2, 3]])
        ->assertOk()->assertJsonPath('leadTimeDays', 0)->assertJsonPath('allowedWeekdays', [1, 2, 3]);
    $this->getJson('/api/services/house-blessing/availability?date=2026-11-03')->assertJsonPath('reason', null);   // Tuesday, no lead time now
    $this->getJson('/api/services/house-blessing/availability?date=2026-11-07')->assertJsonPath('status', 'unavailable'); // Saturday removed
    expect(AuditLog::where('action', 'settings.service_updated')->first()->metadata['after']['leadTimeDays'])->toBe(0);
});

test('service fee rules are enforced', function () {
    $svc = '/api/admin/settings/services/';
    $this->actingAs($this->admin)->patchJson($svc.'funeral', ['feeRule' => 'per_sponsor', 'priceCentavos' => 5000])->assertUnprocessable(); // no sponsors
    $this->actingAs($this->admin)->patchJson($svc.'funeral', ['feeRule' => 'flat'])->assertUnprocessable(); // price missing
    $this->actingAs($this->admin)->patchJson($svc.'funeral', ['feeRule' => 'flat', 'priceCentavos' => 100000])->assertOk()->assertJsonPath('priceCentavos', 100000);
    $this->actingAs($this->admin)->patchJson($svc.'funeral', ['feeRule' => 'none'])->assertOk()->assertJsonPath('priceCentavos', null);
    $this->actingAs($this->admin)->patchJson($svc.'funeral', ['sessionTimes' => ['09:00']])->assertUnprocessable(); // funeral has no sessions
    $this->actingAs($this->admin)->patchJson($svc.'baptism', ['sessionTimes' => ['09:00', '11:00'], 'sessionCapacity' => 12])->assertOk()->assertJsonPath('sessionTimes', ['09:00', '11:00']);
    $this->actingAs($this->admin)->patchJson($svc.'baptism', ['allowedWeekdays' => []])->assertUnprocessable();
    $this->actingAs($this->staff)->patchJson($svc.'baptism', ['leadTimeDays' => 1])->assertForbidden();
});

test('a session must start and end inside working hours when a service is saved', function () {
    $svc = '/api/admin/settings/services/baptism'; // sessions last 60 minutes; hours are 08:00-17:00
    foreach ([['18:00'], ['07:00'], ['10:00', '16:30']] as $times) {
        $bad = collect($times)->first(fn ($t) => $t >= '16:30' || $t < '08:00');
        $this->actingAs($this->admin)->patchJson($svc, ['sessionTimes' => $times])->assertUnprocessable()
            ->assertJsonValidationErrors('sessionTimes')
            ->assertJsonPath('errors.sessionTimes.0', "Session at {$bad} falls outside working hours (08:00–17:00).");
    }
    // A longer session pushes the existing 10:00 start past closing.
    $this->actingAs($this->admin)->patchJson($svc, ['sessionDurationMinutes' => 480])->assertUnprocessable()
        ->assertJsonPath('errors.sessionTimes.0', 'Session at 10:00 falls outside working hours (08:00–17:00).');
    $this->actingAs($this->admin)->patchJson($svc, ['sessionTimes' => ['08:00', '16:00']])->assertOk(); // exactly on both edges
    expect(Service::find('baptism')->session_times)->toBe(['08:00', '16:00']);
});

test('saving other fields of a service is not blocked by its sessions', function () {
    $this->actingAs($this->admin)->patchJson('/api/admin/settings/services/baptism', ['sessionTimes' => ['16:00']])->assertOk();
    ParishSetting::put('working_hours_end', '16:30'); // as if hours were tightened some other way
    $this->actingAs($this->admin)->patchJson('/api/admin/settings/services/baptism', ['leadTimeDays' => 5])->assertOk();
});

test('working hours cannot be changed so that a service session falls outside them', function () {
    $url = '/api/admin/settings/parish';
    $this->actingAs($this->admin)->patchJson($url, ['workingHoursEnd' => '10:30'])->assertUnprocessable()
        ->assertJsonPath('errors.workingHoursEnd.0', "Baptism's session at 10:00 would fall outside the new working hours (08:00–10:30).");
    $this->actingAs($this->admin)->patchJson($url, ['workingHoursStart' => '10:30'])->assertUnprocessable()
        ->assertJsonPath('errors.workingHoursStart.0', "Baptism's session at 10:00 would fall outside the new working hours (10:30–17:00).");
    expect(ParishSetting::workingHours())->toBe(['08:00', '17:00']);

    $this->actingAs($this->admin)->patchJson($url, ['workingHoursStart' => '09:00', 'workingHoursEnd' => '17:30'])->assertOk();
    $this->actingAs($this->admin)->patchJson($url, ['workingHoursEnd' => '11:00'])->assertOk(); // 10:00 + 60 min ends exactly at close
});

test('a fee change does not touch a booking already submitted', function () {
    $b = Booking::factory()->create(['sacrament' => 'wedding', 'status' => 'submitted', 'payment_status' => 'unpaid', 'amount_due_centavos' => 500000, 'payment_hold_expires_at' => now()->addDay()]);
    $this->actingAs($this->admin)->patchJson('/api/admin/settings/services/wedding', ['priceCentavos' => 800000])->assertOk();
    $this->actingAs($this->staff)->getJson("/api/admin/bookings/{$b->id}")->assertJsonPath('amountDueCentavos', 500000);
});

test('re-seeding never overwrites staff edits', function () {
    Service::find('wedding')->update(['price_centavos' => 800000, 'lead_time_days' => 60]);
    $this->seed(ServiceSeeder::class);
    expect(Service::find('wedding')->price_centavos)->toBe(800000)->and(Service::find('wedding')->lead_time_days)->toBe(60);
});

// Review Focus 4
test('a blackout over existing bookings is allowed and lists who is affected', function () {
    $funeral = Booking::factory()->scheduled('2026-11-10', '10:00', '11:00')->create(['sacrament' => 'funeral', 'status' => 'approved', 'payment_status' => 'not_required',
        'form_data' => ['deceasedFirstName' => 'Pedro', 'deceasedLastName' => 'Lim']]);
    Booking::factory()->scheduled('2026-11-11', '10:00', '10:45')->create(['sacrament' => 'house-blessing', 'status' => 'approved', 'payment_status' => 'not_required']);

    $json = $this->actingAs($this->staff)->postJson('/api/admin/blackouts', ['date' => '2026-11-10', 'endDate' => '2026-11-11', 'reason' => 'Parish fiesta', 'sacraments' => ['funeral']])
        ->assertCreated()->assertJsonCount(2, 'blackouts')->json();

    expect($json['affectedBookings'])->toHaveCount(1)->and($json['affectedBookings'][0]['id'])->toBe($funeral->id)
        ->and($json['affectedBookings'][0]['subjectName'])->toBe('Pedro Lim');
    expect($funeral->fresh()->status->value)->toBe('approved')->and($funeral->fresh()->appointmentDateString())->toBe('2026-11-10');
    $this->getJson('/api/services/funeral/availability?date=2026-11-10')->assertJsonPath('reason', 'Unavailable: Parish fiesta.');
});

test('blackouts are validated, listed from today, deletable and audited', function () {
    $this->actingAs($this->staff)->postJson('/api/admin/blackouts', ['date' => '2026-11-10', 'endDate' => '2027-01-10', 'reason' => 'Too long'])->assertUnprocessable();
    $this->actingAs($this->staff)->postJson('/api/admin/blackouts', ['date' => '2026-11-10', 'reason' => 'x', 'sacraments' => ['nope']])->assertUnprocessable();

    BlackoutDate::create(['date' => '2026-10-01', 'reason' => 'Past', 'sacraments' => null]);
    $id = $this->actingAs($this->staff)->postJson('/api/admin/blackouts', ['date' => '2026-11-10', 'reason' => 'Retreat'])->json('blackouts.0.id');
    $this->actingAs($this->staff)->postJson('/api/admin/blackouts', ['date' => '2026-11-10', 'reason' => 'Retreat'])->assertCreated()->assertJsonCount(0, 'blackouts'); // duplicate skipped

    $this->actingAs($this->staff)->getJson('/api/admin/blackouts')->assertOk()->assertJsonCount(1)->assertJsonPath('0.reason', 'Retreat');
    $this->actingAs($this->staff)->deleteJson("/api/admin/blackouts/{$id}")->assertNoContent();
    expect(BlackoutDate::find($id))->toBeNull()
        ->and(AuditLog::whereIn('action', ['blackout.created', 'blackout.deleted'])->count())->toBe(2);
    $this->actingAs(User::factory()->create())->getJson('/api/admin/blackouts')->assertForbidden();
});

test('the parish address is read and changed with the other parish settings', function () {
    $this->actingAs($this->staff)->getJson('/api/admin/settings')->assertOk()->assertJsonPath('parish.parishAddress', 'Balagtas, Bulacan');
    $this->actingAs($this->admin)->patchJson('/api/admin/settings/parish', ['parishAddress' => 'Poblacion, Balagtas, Bulacan'])
        ->assertOk()->assertJsonPath('parishAddress', 'Poblacion, Balagtas, Bulacan');
    expect(ParishSetting::parishAddress())->toBe('Poblacion, Balagtas, Bulacan');
});
