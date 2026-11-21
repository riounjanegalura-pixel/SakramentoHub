<?php

use App\Models\User;

test('me includes the user role', function () {
    $user = User::factory()->create(['role' => 'parishioner']);

    $this->actingAs($user)->getJson('/api/me')
        ->assertOk()
        ->assertJsonPath('role', 'parishioner');
});

test('a parishioner is 403d out of a role-gated route', function () {
    $user = User::factory()->create(['role' => 'parishioner']);

    $this->actingAs($user)->getJson('/api/admin/bookings')->assertForbidden();
});

test('staff can access a role-gated route', function () {
    $staff = User::factory()->create(['role' => 'staff']);

    $this->actingAs($staff)->getJson('/api/admin/bookings')->assertOk();
});

test('admin can access a role-gated route', function () {
    $admin = User::factory()->create(['role' => 'admin']);

    $this->actingAs($admin)->getJson('/api/admin/bookings')->assertOk();
});
