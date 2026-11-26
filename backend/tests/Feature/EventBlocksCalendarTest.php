<?php

use App\Models\ParishEvent;
use App\Models\User;
use Illuminate\Support\Carbon;

beforeEach(function () {
    $this->seed(\Database\Seeders\ServiceSeeder::class);
    $this->seed(\Database\Seeders\ParishSettingSeeder::class);
    Carbon::setTestNow(Carbon::parse('2026-11-02 00:00:00', 'UTC')); // Mon 08:00 Manila
    $this->staff = User::factory()->create(['role' => 'staff']);
});
afterEach(fn () => Carbon::setTestNow());

function eventStarts(string $date): array
{
    return test()->getJson("/api/services/funeral/availability?date={$date}")->assertOk()->json('freeStarts');
}

test('an event of any category closes the time it takes for every sacrament', function () {
    // Wednesday 25 Nov, 08:00 Manila for two hours (stored as the real instant, 00:00 UTC).
    ParishEvent::create(['title' => 'Parish assembly', 'date' => Carbon::parse('2026-11-25 08:00', 'Asia/Manila')->utc(), 'location' => 'Parish hall', 'category' => 'general', 'duration_minutes' => 120]);

    $times = eventStarts('2026-11-25');

    expect($times)->not->toContain('08:00')->not->toContain('09:00')->toContain('10:00');
});

test('an event that is not set to block leaves the calendar alone', function () {
    ParishEvent::create(['title' => 'Bulletin notice', 'date' => Carbon::parse('2026-11-25 08:00', 'Asia/Manila')->utc(), 'location' => 'Parish', 'category' => 'general', 'duration_minutes' => 120, 'blocks_bookings' => false]);

    expect(eventStarts('2026-11-25'))->toContain('08:00')->toContain('09:00');
});

test('the creator sets the length and whether the event blocks', function () {
    $response = $this->actingAs($this->staff)->postJson('/api/admin/parish-events', [
        'title' => 'Parish assembly', 'date' => '2026-11-25T08:00:00+08:00', 'category' => 'general',
        'durationMinutes' => 120, 'blocksBookings' => true,
    ])->assertCreated()->assertJsonPath('durationMinutes', 120)->assertJsonPath('blocksBookings', true);

    expect(eventStarts('2026-11-25'))->not->toContain('08:00')->not->toContain('09:00');

    $this->actingAs($this->staff)->patchJson('/api/admin/parish-events/'.$response->json('id'), [
        'title' => 'Parish assembly', 'date' => '2026-11-25T08:00:00+08:00', 'category' => 'general',
        'durationMinutes' => 60, 'blocksBookings' => false,
    ])->assertOk()->assertJsonPath('blocksBookings', false);

    expect(eventStarts('2026-11-25'))->toContain('08:00');
});

test('a new event blocks for an hour unless told otherwise', function () {
    $this->actingAs($this->staff)->postJson('/api/admin/parish-events', [
        'title' => 'Feast day', 'date' => '2026-11-25T08:00:00+08:00', 'category' => 'general',
    ])->assertCreated()->assertJsonPath('durationMinutes', 60)->assertJsonPath('blocksBookings', true);
});

test('the length of an event is checked', function (int $minutes) {
    $this->actingAs($this->staff)->postJson('/api/admin/parish-events', [
        'title' => 'Feast day', 'date' => '2026-11-25T08:00:00+08:00', 'category' => 'general', 'durationMinutes' => $minutes,
    ])->assertUnprocessable()->assertJsonValidationErrors(['durationMinutes']);
})->with([5, 721]);

test('an event on another day closes nothing today', function () {
    ParishEvent::create(['title' => 'Parish assembly', 'date' => Carbon::parse('2026-11-26 08:00', 'Asia/Manila')->utc(), 'location' => 'Parish hall', 'category' => 'general', 'duration_minutes' => 120]);

    expect(eventStarts('2026-11-25'))->toContain('08:00');
});
