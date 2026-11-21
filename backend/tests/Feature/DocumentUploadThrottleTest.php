<?php

use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

beforeEach(fn () => Storage::fake('local'));

// Found in a browser run: a wedding has sixteen document slots (the cap is 40 a minute) ; it had ten, and a parishioner who
// had just browsed a few calendar months got 429 on the uploads. The upload throttle shared
// the authenticated group's per-user counter (and so counted every request twice).
test('document uploads have their own counter, not the whole authenticated group\'s', function () {
    $user = User::factory()->create();

    foreach (range(1, 30) as $i) {
        $this->actingAs($user)->getJson('/api/bookings')->assertOk();
    }

    foreach (range(1, 10) as $i) {
        $this->actingAs($user)
            ->post('/api/documents', ['file' => UploadedFile::fake()->create("doc{$i}.pdf", 20, 'application/pdf')], ['Accept' => 'application/json'])
            ->assertSuccessful();
    }
});

test('document uploads are capped at 40 a minute', function () {
    $user = User::factory()->create();

    foreach (range(1, 40) as $i) {
        $this->actingAs($user)
            ->post('/api/documents', ['file' => UploadedFile::fake()->create("doc{$i}.pdf", 20, 'application/pdf')], ['Accept' => 'application/json'])
            ->assertSuccessful();
    }
    $this->actingAs($user)
        ->post('/api/documents', ['file' => UploadedFile::fake()->create('one-more.pdf', 20, 'application/pdf')], ['Accept' => 'application/json'])
        ->assertStatus(429);
});

test('staff document reviews have their own counter and are not held to the general 60 a minute', function () {
    $this->seed(\Database\Seeders\ServiceSeeder::class);
    $staff = User::factory()->create(['role' => 'staff']);
    $owner = User::factory()->create();
    $booking = \App\Models\Booking::factory()->scheduled('2026-11-03', '10:00', '11:00')->create([
        'user_id' => $owner->id, 'sacrament' => 'funeral', 'status' => 'submitted', 'payment_status' => 'not_required',
        'form_data' => formDataFixture('funeral/valid-basic', $owner->id),
    ]);

    foreach (range(1, 120) as $i) {
        $this->actingAs($staff)->putJson("/api/admin/bookings/{$booking->id}/documents/deathCertificate", ['status' => 'accepted'])->assertOk();
    }
    $this->actingAs($staff)->putJson("/api/admin/bookings/{$booking->id}/documents/deathCertificate", ['status' => 'accepted'])->assertStatus(429);
});

// a wedding has 16 documents. Staff entering one for a walk-in upload each file (40 a minute on its own counter)
// and every request also counts against the shared 60 a minute, so a full wedding must fit with room for the desk's other calls.
test('staff can upload a full wedding\'s 16 documents with room to spare', function () {
    $staff = User::factory()->create(['role' => 'staff']);

    foreach (range(1, 16) as $i) {
        $this->actingAs($staff)
            ->post('/api/documents', ['file' => UploadedFile::fake()->create("wedding{$i}.pdf", 20, 'application/pdf')], ['Accept' => 'application/json'])
            ->assertSuccessful();
    }
    // The desk also saves the draft and checks the calendar between uploads; 16 of those on top still stay under the 60.
    foreach (range(1, 16) as $i) {
        $this->actingAs($staff)->getJson('/api/admin/bookings')->assertOk();
    }
});
