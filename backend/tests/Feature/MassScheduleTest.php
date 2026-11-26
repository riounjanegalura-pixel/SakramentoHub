<?php

use App\Models\ParishSetting;
use App\Models\Service;
use App\Services\Scheduling\MassSchedule;
use Illuminate\Support\Carbon;

beforeEach(function () {
    $this->seed(\Database\Seeders\ServiceSeeder::class);
    $this->seed(\Database\Seeders\ParishSettingSeeder::class);
    Carbon::setTestNow(Carbon::parse('2026-11-02 00:00:00', 'UTC')); // Mon 08:00 Manila
    $this->admin = \App\Models\User::factory()->create(['role' => 'admin']);
});
afterEach(fn () => Carbon::setTestNow());

/** @return list<string> */
function massStarts(string $service, string $date): array
{
    return test()->getJson("/api/services/{$service}/availability?date={$date}")->assertOk()->json('freeStarts');
}

function massMinutes(string $t): int
{
    [$h, $m] = array_map('intval', explode(':', $t));

    return $h * 60 + $m;
}

test('visits offered one after another never overlap, for every service', function () {
    foreach (Service::all() as $service) {
        $times = massStarts($service->id, '2026-11-25'); // a Wednesday
        $length = $service->duration_minutes;
        foreach ($times as $i => $t) {
            if ($i > 0) {
                expect(massMinutes($t) - massMinutes($times[$i - 1]))->toBeGreaterThanOrEqual($length, "{$service->id}: {$times[$i - 1]} then {$t}");
            }
        }
    }
});

test('a 45 minute visit is followed by the next time at 45 minutes, and lunch is skipped', function () {
    expect(massStarts('baptism', '2026-11-24'))->toBe(['08:00', '08:45', '09:30', '10:15', '11:00', '13:00', '13:45', '14:30', '15:15', '16:00']);
});

test('the gap setting spaces visits further apart', function () {
    ParishSetting::put('slot_gap_minutes', 15);

    expect(massStarts('baptism', '2026-11-24'))->toBe(['08:00', '09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00']);
});

test('the Saturday 7 AM Mass and its buffer close the first visit', function () {
    $times = massStarts('baptism', '2026-11-28'); // Mass 07:00-08:00 plus 15 minutes after: 08:15

    expect($times)->not->toContain('08:00')->and($times)->toContain('08:45');
});

test('the Mass buffer is a setting', function () {
    ParishSetting::put('mass_buffer_minutes', 0);

    expect(massStarts('baptism', '2026-11-28'))->toContain('08:00'); // the Mass ends at 08:00 exactly

    ParishSetting::put('mass_buffer_minutes', 30);

    expect(massStarts('baptism', '2026-11-28'))->not->toContain('08:00')->toContain('08:45');
});

test('Monday has no Mass, so nothing is closed', function () {
    expect(massStarts('funeral', '2026-11-23'))->toContain('08:00');
});

test('every Sunday Mass closes the calendar around it', function () {
    $times = massStarts('funeral', '2026-11-29'); // Masses at 06:30, 08:00 and 17:00

    expect($times)->not->toContain('08:00')->not->toContain('09:00')->not->toContain('16:00')->toContain('15:00');
});

test('the first Friday adds its Holy Hour and 7:30 Mass on top of the daily Mass', function () {
    $first = massStarts('funeral', '2026-12-04');
    $ordinary = massStarts('funeral', '2026-11-27');

    expect($ordinary)->toContain('08:00')->and($first)->not->toContain('08:00')->toContain('09:00');
});

test('intervals are minutes from midnight and widened by the buffer', function () {
    $day = app(MassSchedule::class)->intervalsFor('2026-11-29');

    expect($day)->toContain([6 * 60 + 15, 7 * 60 + 45])   // 06:30 for an hour, 15 minutes either side
        ->toContain([16 * 60 + 45, 18 * 60 + 15]);         // 17:00
    expect(app(MassSchedule::class)->intervalsFor('2026-11-23'))->toBe([]);
});

test('an empty schedule closes nothing', function () {
    ParishSetting::put('mass_schedule', []);

    expect(app(MassSchedule::class)->intervalsFor('2026-11-29'))->toBe([])
        ->and(massStarts('funeral', '2026-11-29'))->toContain('08:00');
});

test('the admin edits the Mass schedule and the public parish record shows it', function () {
    $rows = [
        ['label' => 'Daily Mass', 'time' => '06:00', 'durationMinutes' => 45, 'weekdays' => [1, 2, 3], 'firstFriday' => false],
        ['label' => 'Holy Hour', 'time' => '15:00', 'durationMinutes' => 60, 'weekdays' => [], 'firstFriday' => true],
    ];

    $this->actingAs($this->admin)->patchJson('/api/admin/settings/parish', ['massSchedule' => $rows])
        ->assertOk()->assertJsonPath('massSchedule', $rows);
    $this->getJson('/api/parish')->assertOk()->assertJsonPath('massSchedule.0.label', 'Daily Mass');
    expect(app(MassSchedule::class)->intervalsFor('2026-11-23'))->toBe([[5 * 60 + 45, 7 * 60 + 0]]); // Monday 06:00-06:45, 15 minutes either side
});

test('a Mass row is checked', function (array $row, string $field) {
    $good = ['label' => 'Mass', 'time' => '06:00', 'durationMinutes' => 60, 'weekdays' => [1], 'firstFriday' => false];

    $this->actingAs($this->admin)->patchJson('/api/admin/settings/parish', ['massSchedule' => [array_merge($good, $row)]])
        ->assertUnprocessable()->assertJsonValidationErrors(["massSchedule.0.{$field}"]);
})->with([
    'a bad time' => [['time' => '6am'], 'time'],
    'too short' => [['durationMinutes' => 5], 'durationMinutes'],
    'too long' => [['durationMinutes' => 500], 'durationMinutes'],
    'no label' => [['label' => ''], 'label'],
    'a weekday that is not one' => [['weekdays' => [9]], 'weekdays.0'],
]);

test('a Mass row needs a weekday or the first Friday', function () {
    $row = ['label' => 'Mass', 'time' => '06:00', 'durationMinutes' => 60, 'weekdays' => [], 'firstFriday' => false];

    $this->actingAs($this->admin)->patchJson('/api/admin/settings/parish', ['massSchedule' => [$row]])->assertUnprocessable();
});
