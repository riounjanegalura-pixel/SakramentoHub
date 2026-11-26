<?php

use App\Models\AuditLog;
use App\Models\BlackoutDate;
use App\Models\Booking;
use App\Models\Service;
use App\Models\User;
use App\Services\Scheduling\AppointmentRequest;
use App\Services\Scheduling\SchedulingService;
use Illuminate\Support\Carbon;

beforeEach(function () {
    $this->seed(\Database\Seeders\ServiceSeeder::class);
    $this->seed(\Database\Seeders\ParishSettingSeeder::class);
    Carbon::setTestNow(Carbon::parse('2026-11-02 00:00:00', 'UTC')); // Mon 08:00 Manila
    $this->staff = User::factory()->create(['role' => 'staff']);
});
afterEach(fn () => Carbon::setTestNow());

function startsOn(string $date, string $service = 'funeral'): array
{
    return test()->getJson("/api/services/{$service}/availability?date={$date}")->assertOk()->json('freeStarts');
}

test('a closure with a time window shuts only that window, not the day', function () {
    $this->actingAs($this->staff)->postJson('/api/admin/blackouts', [
        'date' => '2026-11-25', 'reason' => 'Clergy retreat', 'startTime' => '08:00', 'endTime' => '10:00',
    ])->assertCreated()->assertJsonPath('blackouts.0.startTime', '08:00')->assertJsonPath('blackouts.0.endTime', '10:00');

    $times = startsOn('2026-11-25');
    expect($times)->not->toContain('08:00')->not->toContain('09:00')->toContain('10:00');
    $this->getJson('/api/services/funeral/availability?date=2026-11-25')->assertJsonPath('reason', null);
});

test('a closure without a time still closes the whole day', function () {
    $this->actingAs($this->staff)->postJson('/api/admin/blackouts', ['date' => '2026-11-25', 'reason' => 'Parish fiesta'])
        ->assertCreated()->assertJsonPath('blackouts.0.startTime', null)->assertJsonPath('blackouts.0.endTime', null);

    expect(startsOn('2026-11-25'))->toBe([]);
});

test('a timed closure only touches the sacraments it names', function () {
    $this->actingAs($this->staff)->postJson('/api/admin/blackouts', [
        'date' => '2026-11-25', 'reason' => 'Wedding rehearsal', 'startTime' => '08:00', 'endTime' => '10:00', 'sacraments' => ['wedding'],
    ])->assertCreated();

    expect(startsOn('2026-11-25'))->toContain('08:00')->toContain('09:00');
});

test('a session that falls inside a timed closure is not offered', function () {
    $service = Service::find('baptism');
    $weekday = (int) $service->session_weekdays[0];
    $date = Carbon::parse('2026-11-02', 'Asia/Manila')->next($weekday % 7)->addWeeks(2)->toDateString();
    $time = $service->session_times[0];
    $request = new AppointmentRequest('baptism', $date, null, true, false);

    $before = app(SchedulingService::class)->freeStarts($request);
    expect($before)->toContain($time);

    $end = sprintf('%02d:%02d', intdiv((int) substr($time, 0, 2) * 60 + (int) substr($time, 3, 2) + 30, 60), ((int) substr($time, 3, 2) + 30) % 60);
    BlackoutDate::create(['date' => $date, 'reason' => 'Priest away', 'start_time' => $time, 'end_time' => $end, 'sacraments' => null]);

    expect(app(SchedulingService::class)->freeStarts($request))->not->toContain($time);
});

test('the window needs both times, in order', function () {
    $post = fn (array $extra) => $this->actingAs($this->staff)->postJson('/api/admin/blackouts', ['date' => '2026-11-25', 'reason' => 'Retreat'] + $extra);

    $post(['startTime' => '08:00'])->assertUnprocessable()->assertJsonValidationErrors(['endTime']);
    $post(['endTime' => '10:00'])->assertUnprocessable()->assertJsonValidationErrors(['startTime']);
    $post(['startTime' => '10:00', 'endTime' => '08:00'])->assertUnprocessable()->assertJsonValidationErrors(['endTime']);
    $post(['startTime' => '10:00', 'endTime' => '10:00'])->assertUnprocessable()->assertJsonValidationErrors(['endTime']);
    $post(['startTime' => 'soon', 'endTime' => '10:00'])->assertUnprocessable()->assertJsonValidationErrors(['startTime']);
    expect(BlackoutDate::count())->toBe(0);
});

test('only visits that overlap the window are listed as affected', function () {
    $inside = Booking::factory()->scheduled('2026-11-25', '09:00', '10:00')->create(['sacrament' => 'funeral', 'status' => 'approved', 'payment_status' => 'not_required']);
    Booking::factory()->scheduled('2026-11-25', '13:00', '14:00')->create(['sacrament' => 'funeral', 'status' => 'approved', 'payment_status' => 'not_required']);

    $json = $this->actingAs($this->staff)->postJson('/api/admin/blackouts', [
        'date' => '2026-11-25', 'reason' => 'Clergy retreat', 'startTime' => '08:30', 'endTime' => '10:00',
    ])->assertCreated()->json();

    expect($json['affectedBookings'])->toHaveCount(1)->and($json['affectedBookings'][0]['id'])->toBe($inside->id);
});

test('the same window is not added twice, but another window on the same day is', function () {
    $post = fn (string $from, string $to) => $this->actingAs($this->staff)->postJson('/api/admin/blackouts', [
        'date' => '2026-11-25', 'reason' => 'Retreat', 'startTime' => $from, 'endTime' => $to,
    ])->assertCreated();

    $post('08:00', '10:00')->assertJsonCount(1, 'blackouts');
    $post('08:00', '10:00')->assertJsonCount(0, 'blackouts');
    $post('13:00', '15:00')->assertJsonCount(1, 'blackouts');
    expect(AuditLog::where('action', 'blackout.created')->count())->toBe(2);
});

test('the schedule shows a timed closure with its times and keeps the day open', function () {
    $this->actingAs($this->staff)->postJson('/api/admin/blackouts', [
        'date' => '2026-11-25', 'reason' => 'Clergy retreat', 'startTime' => '08:00', 'endTime' => '10:00',
    ])->assertCreated();

    $this->actingAs($this->staff)->getJson('/api/admin/schedule?start=2026-11-25&end=2026-11-25')->assertOk()
        ->assertJsonPath('days.0.blackouts.0.reason', 'Clergy retreat')
        ->assertJsonPath('days.0.blackouts.0.start', '08:00')
        ->assertJsonPath('days.0.blackouts.0.end', '10:00');
});
