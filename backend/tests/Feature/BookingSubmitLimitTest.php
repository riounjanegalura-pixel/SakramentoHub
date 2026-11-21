<?php

use App\Models\Booking;
use App\Models\User;
use App\Services\Booking\BookingStateMachine;
use Database\Seeders\ParishSettingSeeder;
use Database\Seeders\ServiceSeeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;

beforeEach(function () {
    $this->seed(ServiceSeeder::class);
    $this->seed(ParishSettingSeeder::class);
    Storage::fake('local');
    Http::fake(['*' => Http::response(['data' => ['id' => 'cs_1', 'attributes' => ['status' => 'expired', 'checkout_url' => 'https://x']]])]);
    Carbon::setTestNow(Carbon::parse('2026-11-02 00:00:00', 'UTC'));
});

afterEach(fn () => Carbon::setTestNow());

// Same shape as draftFor() in BookingStateMachineTest: a complete baptism draft the owner can submit.
function submittableDraft(User $owner): Booking
{
    return Booking::factory()->create([
        'user_id' => $owner->id,
        'created_by' => $owner->id,
        'sacrament' => 'baptism',
        'status' => 'draft',
        'channel' => 'online',
        'form_data' => formDataFixture('baptism/valid-basic', $owner->id),
        'appointment_date' => '2026-11-15',
        'appointment_start' => '10:00',
    ]);
}

test('a parishioner cannot have a fourth booking waiting for a decision', function () {
    $owner = User::factory()->create(['role' => 'parishioner', 'email_verified_at' => now()]);
    Sanctum::actingAs($owner);

    foreach (range(1, BookingStateMachine::MAX_UNDECIDED_SUBMISSIONS) as $_) {
        Booking::factory()->create(['user_id' => $owner->id, 'status' => 'submitted', 'channel' => 'online']);
    }

    $fourth = submittableDraft($owner);

    $this->patchJson("/api/bookings/{$fourth->id}/submit")
        ->assertStatus(422)
        ->assertJsonFragment(['message' => 'You already have 3 bookings waiting for the parish office to review. Wait for a decision before sending another.']);

    expect($fourth->fresh()->status->value)->toBe('draft');
});

test('a booking that is approved or completed does not count toward the limit', function () {
    $owner = User::factory()->create(['role' => 'parishioner', 'email_verified_at' => now()]);
    Sanctum::actingAs($owner);

    foreach (['approved', 'completed', 'declined'] as $status) {
        Booking::factory()->create(['user_id' => $owner->id, 'status' => $status, 'channel' => 'online']);
    }

    $this->patchJson('/api/bookings/'.submittableDraft($owner)->id.'/submit')->assertOk();
});

test('staff-created walk-in bookings never count toward a parishioner limit', function () {
    $owner = User::factory()->create(['role' => 'parishioner', 'email_verified_at' => now()]);
    $staff = User::factory()->create(['role' => 'staff']);

    foreach (range(1, 5) as $_) {
        Booking::factory()->create(['user_id' => $owner->id, 'created_by' => $staff->id, 'status' => 'submitted', 'channel' => 'walk_in']);
    }

    Sanctum::actingAs($owner);
    $this->patchJson('/api/bookings/'.submittableDraft($owner)->id.'/submit')->assertOk();
});
