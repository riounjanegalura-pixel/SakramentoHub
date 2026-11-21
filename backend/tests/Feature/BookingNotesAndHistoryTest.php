<?php

use App\Models\Booking;
use App\Models\User;

beforeEach(function () {
    $this->seed(\Database\Seeders\ServiceSeeder::class);
    $this->seed(\Database\Seeders\ParishSettingSeeder::class);
    \Illuminate\Support\Carbon::setTestNow(\Illuminate\Support\Carbon::parse('2026-11-02 00:00:00', 'UTC')); // Mon 08:00 Manila
    \Illuminate\Support\Facades\Storage::fake('local');
    $this->staff = User::factory()->create(['role' => 'staff']);
    $this->admin = User::factory()->create(['role' => 'admin']);
});
afterEach(fn () => \Illuminate\Support\Carbon::setTestNow());

test('staff add and list notes in order', function () {
    $b = Booking::factory()->create(['status' => 'submitted']);
    $this->actingAs($this->staff)->postJson("/api/admin/bookings/{$b->id}/notes", ['body' => 'Called the family, no answer.'])
        ->assertCreated()->assertJsonPath('author.fullName', $this->staff->full_name);
    $this->actingAs($this->admin)->postJson("/api/admin/bookings/{$b->id}/notes", ['body' => 'Reached them at 3 PM.'])->assertCreated();

    $this->actingAs($this->staff)->getJson("/api/admin/bookings/{$b->id}/notes")->assertOk()
        ->assertJsonCount(2)->assertJsonPath('0.body', 'Called the family, no answer.')->assertJsonPath('1.body', 'Reached them at 3 PM.');
});

test('a note needs a body of at most 2000 characters', function () {
    $b = Booking::factory()->create();
    $this->actingAs($this->staff)->postJson("/api/admin/bookings/{$b->id}/notes", ['body' => ''])->assertUnprocessable();
    $this->actingAs($this->staff)->postJson("/api/admin/bookings/{$b->id}/notes", ['body' => str_repeat('a', 2001)])->assertUnprocessable();
});

test('notes never reach the parishioner', function () {
    $owner = User::factory()->create();
    $b = Booking::factory()->create(['user_id' => $owner->id]);
    $this->actingAs($this->staff)->postJson("/api/admin/bookings/{$b->id}/notes", ['body' => 'Internal only']);

    $this->actingAs($owner)->getJson("/api/admin/bookings/{$b->id}/notes")->assertForbidden();
    expect($this->actingAs($owner)->getJson("/api/bookings/{$b->id}")->assertOk()->getContent())->not->toContain('Internal only');
});

test('there is no way to edit or delete a note', function () {
    $b = Booking::factory()->create();
    $id = $this->actingAs($this->staff)->postJson("/api/admin/bookings/{$b->id}/notes", ['body' => 'x'])->json('id');
    // No such endpoint exists: the router answers 404 or 405, never 2xx.
    expect($this->actingAs($this->admin)->deleteJson("/api/admin/bookings/{$b->id}/notes/{$id}")->status())->toBeIn([404, 405]);
    expect($this->actingAs($this->admin)->patchJson("/api/admin/bookings/{$b->id}/notes/{$id}", ['body' => 'y'])->status())->toBeIn([404, 405]);
    expect(\App\Models\BookingNote::find($id)->body)->toBe('x');
});

test('history lists the booking audit entries oldest first', function () {
    $b = Booking::factory()->scheduled('2026-11-03', '10:00', '11:00')->create(['sacrament' => 'house-blessing', 'status' => 'submitted', 'payment_status' => 'not_required']);
    $this->actingAs($this->staff)->patchJson("/api/admin/bookings/{$b->id}/return", ['note' => 'Fix the address']);
    $this->actingAs($this->staff)->patchJson("/api/admin/bookings/{$b->id}/cancel", ['reason' => 'Requested']);

    $this->actingAs($this->staff)->getJson("/api/admin/bookings/{$b->id}/history")->assertOk()
        ->assertJsonPath('0.action', 'booking.returned')->assertJsonPath('1.action', 'booking.cancelled')
        ->assertJsonPath('0.actor.fullName', $this->staff->full_name);
});
