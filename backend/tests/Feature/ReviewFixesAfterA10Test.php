<?php

use App\Models\AuditLog;
use App\Models\Booking;
use App\Models\ParishEvent;
use App\Models\User;
use Database\Seeders\ParishEventSeeder;
use Illuminate\Support\Facades\Storage;

beforeEach(function () {
    $this->seed(\Database\Seeders\ServiceSeeder::class);
    $this->seed(\Database\Seeders\ParishSettingSeeder::class);
    Storage::fake('local');
    $this->staff = User::factory()->create(['role' => 'staff']);
    $this->admin = User::factory()->create(['role' => 'admin']);
});

test('analytics recency counts leave out drafts', function () {
    Booking::factory()->create(['status' => 'draft', 'sacrament' => 'baptism', 'created_at' => now()]);
    Booking::factory()->create(['status' => 'submitted', 'sacrament' => 'baptism', 'created_at' => now()]);

    $json = $this->actingAs($this->staff)->getJson('/api/admin/analytics')->assertOk()->json();

    expect($json['createdLast7Days'])->toBe(1)->and($json['createdLast30Days'])->toBe(1);
});

test('a parishioner cannot open another parishioner\'s file by pasting its URL into their own draft', function () {
    $a = User::factory()->create();
    $b = User::factory()->create();
    $path = "documents/{$a->id}/secret.pdf";
    Storage::disk('local')->put($path, 'x');
    Booking::factory()->create(['user_id' => $b->id, 'sacrament' => 'funeral', 'status' => 'draft', 'form_data' => ['deathCertificate' => "/{$path}"]]);

    $this->actingAs($b)->get("/api/{$path}")->assertForbidden();
});

test('a linked walk-in owner can still open a file staff uploaded, but not one from a deactivated or non-staff uploader', function () {
    $owner = User::factory()->create();
    $path = "documents/{$this->staff->id}/cert.pdf";
    Storage::disk('local')->put($path, 'x');
    Booking::factory()->walkIn($this->staff)->create(['user_id' => $owner->id, 'sacrament' => 'funeral', 'status' => 'submitted', 'form_data' => ['deathCertificate' => "/{$path}"]]);

    $this->actingAs($owner)->get("/api/{$path}")->assertOk();

    $this->staff->forceFill(['is_active' => false])->save();
    $this->actingAs($owner)->get("/api/{$path}")->assertForbidden();
});

test('a walk-in draft does not unlock files for the linked parishioner until submitted', function () {
    $owner = User::factory()->create();
    $path = "documents/{$this->staff->id}/cert.pdf";
    Storage::disk('local')->put($path, 'x');
    Booking::factory()->walkIn($this->staff)->create(['user_id' => $owner->id, 'sacrament' => 'funeral', 'status' => 'draft', 'form_data' => ['deathCertificate' => "/{$path}"]]);

    $this->actingAs($owner)->get("/api/{$path}")->assertForbidden();
});

test('seeding parish events leaves staff-managed events alone', function () {
    ParishEvent::create(['title' => 'Staff event', 'date' => now()->addDays(3), 'location' => 'Hall', 'image_url' => '', 'category' => 'general']);

    $this->seed(ParishEventSeeder::class);

    expect(ParishEvent::count())->toBe(1)->and(ParishEvent::first()->title)->toBe('Staff event');
});

test('seeding parish events on an empty table still creates the defaults', function () {
    $this->seed(ParishEventSeeder::class);

    expect(ParishEvent::count())->toBe(2);
});

test('saving unchanged numeric parish settings is not recorded as a change', function () {
    $current = $this->actingAs($this->admin)->getJson('/api/admin/settings')->json('parish');

    $this->actingAs($this->admin)->patchJson('/api/admin/settings/parish', [
        'slotStepMinutes' => (int) $current['slotStepMinutes'], 'travelBufferMinutes' => (int) $current['travelBufferMinutes'],
    ])->assertOk();

    expect(AuditLog::where('action', 'settings.parish_updated')->count())->toBe(0);

    $res = $this->actingAs($this->admin)->patchJson('/api/admin/settings/parish', ['travelBufferMinutes' => 45])->assertOk();
    expect($res->json('travelBufferMinutes'))->toBe(45);
});

test('a hidden walk-in draft is not payable or exported by the linked parishioner', function () {
    $owner = User::factory()->create();
    $draft = Booking::factory()->walkIn($this->staff)->create(['user_id' => $owner->id, 'sacrament' => 'funeral', 'status' => 'draft']);

    $this->actingAs($owner)->postJson("/api/bookings/{$draft->id}/payment")->assertNotFound();
    $export = $this->actingAs($owner)->get('/api/me/export')->assertOk()->getContent();
    expect($export)->not->toContain($draft->reference_number);
});
