<?php

use App\Models\AuditLog;
use App\Models\ParishEvent;
use App\Models\User;

function makeParishEvent(array $overrides = []): ParishEvent
{
    return ParishEvent::create(array_merge([
        'title' => 'Sunday Mass',
        'date' => now()->addDays(3),
        'location' => 'Main Chapel',
        'image_url' => '/mock-assets/sunday-mass.jpg',
        'category' => 'mass',
    ], $overrides));
}

test('an event can be filed under the Other category, and an unknown category is still rejected', function () {
    $staff = User::factory()->create(['role' => 'staff']);
    $base = ['title' => 'Parish clean-up', 'date' => now()->addWeek()->toISOString(), 'location' => 'Grounds'];

    $this->actingAs($staff)->postJson('/api/admin/parish-events', $base + ['category' => 'other'])
        ->assertCreated()
        ->assertJsonPath('category', 'other');

    $this->actingAs($staff)->postJson('/api/admin/parish-events', $base + ['category' => 'bogus'])
        ->assertUnprocessable();
});

test('parishioner cannot list, create, update, or delete admin parish events', function () {
    $parishioner = User::factory()->create(['role' => 'parishioner']);
    $event = makeParishEvent();

    $this->actingAs($parishioner)->getJson('/api/admin/parish-events')->assertForbidden();
    $this->actingAs($parishioner)->postJson('/api/admin/parish-events', [
        'title' => 'X', 'date' => now()->addDay()->toISOString(), 'location' => 'Y', 'category' => 'mass',
    ])->assertForbidden();
    $this->actingAs($parishioner)->patchJson("/api/admin/parish-events/{$event->id}", [
        'title' => 'X', 'date' => now()->addDay()->toISOString(), 'location' => 'Y', 'category' => 'mass',
    ])->assertForbidden();
    $this->actingAs($parishioner)->deleteJson("/api/admin/parish-events/{$event->id}")->assertForbidden();
});

test('staff can list parish events', function () {
    $staff = User::factory()->create(['role' => 'staff']);
    makeParishEvent(['title' => 'Sunday Mass']);
    makeParishEvent(['title' => 'Baptism Ceremony', 'category' => 'baptism']);

    $response = $this->actingAs($staff)->getJson('/api/admin/parish-events');

    $response->assertOk();
    expect($response->json('data'))->toHaveCount(2);
});

test('staff can create a parish event and created_by is set to the acting user', function () {
    $staff = User::factory()->create(['role' => 'staff']);

    $response = $this->actingAs($staff)->postJson('/api/admin/parish-events', [
        'title' => 'Recollection Day',
        'date' => now()->addWeek()->toISOString(),
        'location' => 'Parish Hall',
        'imageUrl' => '/mock-assets/recollection.jpg',
        'category' => 'general',
    ]);

    $response->assertCreated()
        ->assertJsonPath('title', 'Recollection Day')
        ->assertJsonPath('createdBy', $staff->id)
        ->assertJsonPath('createdByName', $staff->full_name);

    $this->assertDatabaseHas('parish_events', [
        'title' => 'Recollection Day',
        'created_by' => $staff->id,
    ]);

    expect(AuditLog::where('action', 'parish_event.created')->count())->toBe(1);
});

test('admin can also create a parish event', function () {
    $admin = User::factory()->create(['role' => 'admin']);

    $this->actingAs($admin)->postJson('/api/admin/parish-events', [
        'title' => 'Feast Day Mass',
        'date' => now()->addWeek()->toISOString(),
        'location' => 'Main Chapel',
        'category' => 'mass',
    ])->assertCreated();
});

test('validation rejects missing title, missing/invalid date, and invalid category', function () {
    $staff = User::factory()->create(['role' => 'staff']);

    $this->actingAs($staff)->postJson('/api/admin/parish-events', [
        'date' => now()->addDay()->toISOString(),
        'location' => 'Main Chapel',
        'category' => 'mass',
    ])->assertUnprocessable()->assertJsonValidationErrors('title');

    $this->actingAs($staff)->postJson('/api/admin/parish-events', [
        'title' => 'X',
        'date' => 'not-a-date',
        'location' => 'Main Chapel',
        'category' => 'mass',
    ])->assertUnprocessable()->assertJsonValidationErrors('date');

    $this->actingAs($staff)->postJson('/api/admin/parish-events', [
        'title' => 'X',
        'date' => now()->addDay()->toISOString(),
        'location' => 'Main Chapel',
        'category' => 'not-a-real-category',
    ])->assertUnprocessable()->assertJsonValidationErrors('category');
});

test('staff can update a parish event', function () {
    $staff = User::factory()->create(['role' => 'staff']);
    $event = makeParishEvent();

    $response = $this->actingAs($staff)->patchJson("/api/admin/parish-events/{$event->id}", [
        'title' => 'Sunday Mass (Updated)',
        'date' => now()->addDays(4)->toISOString(),
        'location' => 'Main Chapel',
        'category' => 'mass',
    ]);

    $response->assertOk()->assertJsonPath('title', 'Sunday Mass (Updated)');
    expect(AuditLog::where('action', 'parish_event.updated')->count())->toBe(1);
});

test('staff can delete a parish event with an audit-log entry', function () {
    $staff = User::factory()->create(['role' => 'staff']);
    $event = makeParishEvent();

    $this->actingAs($staff)->deleteJson("/api/admin/parish-events/{$event->id}")->assertNoContent();

    $this->assertDatabaseMissing('parish_events', ['id' => $event->id]);
    expect(AuditLog::where('action', 'parish_event.deleted')->count())->toBe(1);
});

test('a parish event survives its creator being deleted, created_by goes null', function () {
    $staff = User::factory()->create(['role' => 'staff']);
    $event = makeParishEvent(['created_by' => $staff->id]);

    $staff->delete();

    $event->refresh();
    expect($event->created_by)->toBeNull();
    $this->assertDatabaseHas('parish_events', ['id' => $event->id, 'title' => $event->title]);
});

test('the public upcoming-events endpoint is completely unaffected by admin parish-event management', function () {
    makeParishEvent(['title' => 'Sunday Mass', 'category' => 'mass']);

    $response = $this->getJson('/api/events/upcoming');

    $response->assertOk()->assertJsonFragment(['title' => 'Sunday Mass']);
});

test('every parish event category is accepted on create, including the legacy mass and general', function (string $category) {
    $staff = User::factory()->create(['role' => 'staff']);

    $this->actingAs($staff)->postJson('/api/admin/parish-events', [
        'title' => 'Parish gathering',
        'date' => now()->addWeek()->toISOString(),
        'location' => 'Parish Hall',
        'category' => $category,
    ])->assertCreated()->assertJsonPath('category', $category);
})->with(['mass', 'feast', 'seminar', 'fundraiser', 'community', 'notice', 'general']);

test('a category is accepted on update, and an unknown one is rejected', function () {
    $staff = User::factory()->create(['role' => 'staff']);
    $event = makeParishEvent();
    $payload = ['title' => 'Feast of the Patron', 'date' => now()->addDays(4)->toISOString(), 'location' => 'Plaza'];

    $this->actingAs($staff)->patchJson("/api/admin/parish-events/{$event->id}", $payload + ['category' => 'feast'])
        ->assertOk()->assertJsonPath('category', 'feast');

    $this->actingAs($staff)->patchJson("/api/admin/parish-events/{$event->id}", $payload + ['category' => 'party'])
        ->assertUnprocessable()->assertJsonValidationErrors('category');
});

test('update keeps an event\'s legacy stored category that is no longer in the list', function () {
    $staff = User::factory()->create(['role' => 'staff']);
    $event = makeParishEvent(['category' => 'baptism']);

    $this->actingAs($staff)->patchJson("/api/admin/parish-events/{$event->id}", [
        'title' => 'Baptism Ceremony (moved)', 'date' => now()->addDays(5)->toISOString(),
        'location' => 'Main Chapel', 'category' => 'baptism',
    ])->assertOk()->assertJsonPath('category', 'baptism');

    expect($event->fresh()->category)->toBe('baptism');
});

test('update rejects a different legacy category than the one the event already has', function () {
    $staff = User::factory()->create(['role' => 'staff']);
    $event = makeParishEvent(['category' => 'baptism']);

    $this->actingAs($staff)->patchJson("/api/admin/parish-events/{$event->id}", [
        'title' => 'X', 'date' => now()->addDays(5)->toISOString(), 'location' => 'Y', 'category' => 'wedding',
    ])->assertUnprocessable()->assertJsonValidationErrors('category');

    $other = makeParishEvent(['category' => 'mass']);
    $this->actingAs($staff)->patchJson("/api/admin/parish-events/{$other->id}", [
        'title' => 'X', 'date' => now()->addDays(5)->toISOString(), 'location' => 'Y', 'category' => 'baptism',
    ])->assertUnprocessable()->assertJsonValidationErrors('category');

    expect($event->fresh()->category)->toBe('baptism');
    expect($other->fresh()->category)->toBe('mass');
});

test('categories outside the list are rejected on create', function (string $category) {
    $staff = User::factory()->create(['role' => 'staff']);

    $this->actingAs($staff)->postJson('/api/admin/parish-events', [
        'title' => 'X', 'date' => now()->addDay()->toISOString(), 'location' => 'Y', 'category' => $category,
    ])->assertUnprocessable()->assertJsonValidationErrors('category');
})->with(['baptism', 'Feast', 'party', '']);

test('the list filters to upcoming or past events and orders each sensibly', function () {
    $staff = User::factory()->create(['role' => 'staff']);
    makeParishEvent(['title' => 'Later', 'date' => now()->addDays(10)]);
    makeParishEvent(['title' => 'Soon', 'date' => now()->addDays(2)]);
    makeParishEvent(['title' => 'Old', 'date' => now()->subDays(20)]);
    makeParishEvent(['title' => 'Recent', 'date' => now()->subDays(2)]);

    $up = $this->actingAs($staff)->getJson('/api/admin/parish-events?when=upcoming')->assertOk();
    expect(collect($up->json('data'))->pluck('title')->all())->toBe(['Soon', 'Later']);

    $past = $this->actingAs($staff)->getJson('/api/admin/parish-events?when=past')->assertOk();
    expect(collect($past->json('data'))->pluck('title')->all())->toBe(['Recent', 'Old']);

    $all = $this->actingAs($staff)->getJson('/api/admin/parish-events')->assertOk();
    expect($all->json('data'))->toHaveCount(4);
});

test('an unknown when value is refused', function () {
    $staff = User::factory()->create(['role' => 'staff']);
    $this->actingAs($staff)->getJson('/api/admin/parish-events?when=sometime')->assertStatus(422);
});

test('a time typed without an offset is parish time, so 10:30 AM stays 10:30 AM', function () {
    $staff = User::factory()->create(['role' => 'staff']);
    $date = now()->addWeek()->setTimezone('Asia/Manila')->format('Y-m-d');

    $res = $this->actingAs($staff)->postJson('/api/admin/parish-events', ['title' => 'Mass', 'date' => "{$date}T10:30", 'category' => 'mass'])
        ->assertCreated();

    // Stored as the instant 02:30 UTC, which is 10:30 in Manila.
    expect(ParishEvent::find($res->json('id'))->date->utc()->format('H:i'))->toBe('02:30');
});

test('an event needs no location: it is held at the parish unless one is named', function () {
    $staff = User::factory()->create(['role' => 'staff']);
    $payload = ['title' => 'Mass', 'date' => now()->addWeek()->toISOString(), 'category' => 'mass'];

    $res = $this->actingAs($staff)->postJson('/api/admin/parish-events', $payload)->assertCreated();
    expect($res->json('location'))->not->toBe('')->not->toBeNull();

    $kept = $res->json('location');
    $this->actingAs($staff)->patchJson('/api/admin/parish-events/'.$res->json('id'), ['title' => 'Mass 2'] + $payload)->assertOk()->assertJsonPath('location', $kept);
});
