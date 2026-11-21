<?php

use App\Models\Booking;
use App\Models\CertificateRequest;
use App\Models\User;
use Illuminate\Support\Facades\DB;

// Needs a real MySQL 8 (DB_CONNECTION=mysql). Skipped on SQLite; run once before merging.
beforeEach(function () {
    if (DB::getDriverName() !== 'mysql') {
        $this->markTestSkipped('Needs DB_CONNECTION=mysql.');
    }
    $this->seed(\Database\Seeders\ServiceSeeder::class);
    $this->admin = User::factory()->create(['role' => 'admin']);
    $this->owner = User::factory()->create(['role' => 'parishioner']);
});

test('a walk-in snapshot name is found when typed in lower case', function () {
    $walkIn = Booking::factory()->walkIn($this->admin, ['fullName' => 'Ñiguez'])->create();

    $this->actingAs($this->admin)->getJson('/api/admin/bookings?search='.urlencode('ñiguez'))
        ->assertOk()->assertJsonFragment(['id' => $walkIn->id]);
});

test('a certificate request is found by the person name', function () {
    $req = CertificateRequest::factory()->create(['user_id' => $this->owner->id, 'person_name' => 'Ñiguez Santos']);

    $this->actingAs($this->admin)->getJson('/api/admin/certificate-requests?search='.urlencode('ñiguez'))
        ->assertOk()->assertJsonFragment(['id' => $req->id]);
});

test('wildcard characters in a term match only literally', function () {
    $pairs = [
        '50%' => ['Rate 50% off', 'Rate 500 off'],
        'a_b' => ['Plan a_b', 'Plan aXb'],
        'x!y' => ['Code x!y', 'Code xQy'],
    ];
    foreach ($pairs as [$hit, $miss]) {
        CertificateRequest::factory()->create(['user_id' => $this->owner->id, 'person_name' => $hit]);
        CertificateRequest::factory()->create(['user_id' => $this->owner->id, 'person_name' => $miss]);
    }

    foreach ($pairs as $term => [$hit]) {
        $res = $this->actingAs($this->admin)->getJson('/api/admin/certificate-requests?search='.urlencode($term))->assertOk();
        expect(collect($res->json('data'))->pluck('personName')->all())->toBe([$hit]);
    }
});
