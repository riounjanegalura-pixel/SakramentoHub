<?php

use App\Models\User;

test('preferences default to all-enabled for a user with none yet', function () {
    $user = User::factory()->create();

    $this->actingAs($user)
        ->getJson('/api/notification-preferences')
        ->assertOk()
        ->assertJson(['pushEnabled' => true, 'bookingReminders' => true, 'parishAnnouncements' => true]);
});

test('updates a single preference without resetting the others', function () {
    $user = User::factory()->create();

    $this->actingAs($user)->patchJson('/api/notification-preferences', ['pushEnabled' => false]);

    $this->actingAs($user)
        ->getJson('/api/notification-preferences')
        ->assertJson(['pushEnabled' => false, 'bookingReminders' => true]);
});

test('preferences are isolated per user', function () {
    $userA = User::factory()->create();
    $userB = User::factory()->create();

    $this->actingAs($userA)->patchJson('/api/notification-preferences', ['pushEnabled' => false]);

    $this->actingAs($userB)
        ->getJson('/api/notification-preferences')
        ->assertJson(['pushEnabled' => true]);
});

test('marks all of the authenticated user\'s notifications read, not other users\'', function () {
    $userA = User::factory()->create();
    $userB = User::factory()->create();
    \App\Models\AppNotification::factory()->create(['user_id' => $userA->id, 'read' => false]);
    \App\Models\AppNotification::factory()->create(['user_id' => $userB->id, 'read' => false]);

    $this->actingAs($userA)->postJson('/api/notifications/mark-all-read')->assertNoContent();

    expect(\App\Models\AppNotification::where('user_id', $userA->id)->first()->read)->toBeTrue();
    expect(\App\Models\AppNotification::where('user_id', $userB->id)->first()->read)->toBeFalse();
});

test('marks a single notification read without touching the others', function () {
    $user = User::factory()->create();
    $target = \App\Models\AppNotification::factory()->create(['user_id' => $user->id, 'read' => false]);
    $other = \App\Models\AppNotification::factory()->create(['user_id' => $user->id, 'read' => false]);

    $this->actingAs($user)->postJson("/api/notifications/{$target->id}/read")->assertNoContent();

    expect($target->fresh()->read)->toBeTrue();
    expect($other->fresh()->read)->toBeFalse();
});

test('cannot mark another user\'s notification read', function () {
    $userA = User::factory()->create();
    $userB = User::factory()->create();
    $notification = \App\Models\AppNotification::factory()->create(['user_id' => $userB->id, 'read' => false]);

    $this->actingAs($userA)->postJson("/api/notifications/{$notification->id}/read")->assertNotFound();

    expect($notification->fresh()->read)->toBeFalse();
});

test('category is computed from created_at at read time, not frozen at write time', function () {
    $user = User::factory()->create();
    // The stored `category` column says 'today' on both — but one was
    // actually created weeks ago. Before this fix, the stored value alone
    // decided the response, so the old row would incorrectly still report
    // 'today' forever.
    \App\Models\AppNotification::factory()->create([
        'user_id' => $user->id,
        'category' => 'today',
        'created_at' => now()->subWeeks(6),
    ]);
    \App\Models\AppNotification::factory()->create([
        'user_id' => $user->id,
        'category' => 'today',
        'created_at' => now(),
    ]);

    $response = $this->actingAs($user)->getJson('/api/notifications');

    $response->assertOk();
    $categories = collect($response->json())->pluck('category')->sort()->values()->all();
    expect($categories)->toBe(['earlier', 'today']);
});
