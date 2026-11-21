<?php

use App\Models\Booking;
use App\Models\ParishSetting;
use App\Models\User;
use Illuminate\Support\Facades\Schema;

beforeEach(function () {
    $this->seed(\Database\Seeders\ServiceSeeder::class);
    $this->seed(\Database\Seeders\ParishSettingSeeder::class);
    $this->staff = User::factory()->create(['role' => 'staff']);
});

test('bookings carry channel, creator and paid/refunded amounts', function () {
    expect(Schema::hasColumns('bookings', ['channel', 'created_by', 'amount_paid_centavos', 'amount_refunded_centavos']))->toBeTrue();
    $b = Booking::factory()->create()->fresh();
    expect($b->channel)->toBe('online')->and($b->amount_refunded_centavos)->toBe(0)->and($b->created_by)->toBeNull();
});

test('review and note tables exist', function () {
    expect(Schema::hasTable('booking_document_reviews'))->toBeTrue()
        ->and(Schema::hasTable('booking_notes'))->toBeTrue();
});

test('subjectName names the person the booking is for', function (string $sacrament, array $data, string $expected) {
    $b = Booking::factory()->create(['sacrament' => $sacrament, 'form_data' => $data]);
    expect($b->subjectName())->toBe($expected);
})->with([
    ['baptism', ['childFirstName' => 'José', 'childLastName' => 'Ñiguez', 'childSuffix' => 'Jr.'], 'José Ñiguez Jr.'],
    ['confirmation', ['confirmandFirstName' => 'Ana', 'confirmandLastName' => 'Reyes'], 'Ana Reyes'],
    ['wedding', ['groomFirstName' => 'Juan', 'groomLastName' => 'Cruz', 'brideFirstName' => 'Maria', 'brideLastName' => 'Santos'], 'Juan Cruz & Maria Santos'],
    ['funeral', ['deceasedFirstName' => 'Pedro', 'deceasedLastName' => 'Lim'], 'Pedro Lim'],
    ['anointing', ['patientFirstName' => 'Rosa', 'patientLastName' => 'Tan'], 'Rosa Tan'],
    ['house-blessing', ['propertyOwner' => 'R&J Trading'], 'R&J Trading'],
]);

test('subjectName falls back to the owner when the form is empty', function () {
    $owner = User::factory()->create(['full_name' => 'Owner Name']);
    expect(Booking::factory()->create(['user_id' => $owner->id])->load('user')->subjectName())->toBe('Owner Name');
});

test('a walk-in has no account, a creator and a snapshot phone', function () {
    $b = Booking::factory()->walkIn($this->staff, ['fullName' => 'Lola Nena', 'phone' => '09171234567'])->create()->fresh();
    expect($b->channel)->toBe('walk_in')->and($b->user_id)->toBeNull()->and($b->created_by)->toBe($this->staff->id)
        ->and($b->ownerName())->toBe('Lola Nena')->and($b->contactPhone())->toBe('09171234567');
});

test('overpayment is derived and only while paid', function () {
    $b = Booking::factory()->create(['payment_status' => 'paid', 'amount_due_centavos' => 5000, 'amount_paid_centavos' => 15000, 'amount_refunded_centavos' => 4000]);
    expect($b->overpaidCentavos())->toBe(6000);
    $b->update(['payment_status' => 'refund_due']);
    expect($b->fresh()->overpaidCentavos())->toBe(0);
});

test('the migration backfills amount paid for bookings that were paid', function () {
    // The migration ran before this row existed; the backfill statement is exercised directly.
    $b = Booking::factory()->create(['payment_status' => 'paid', 'amount_due_centavos' => 500000, 'amount_paid_centavos' => null]);
    (require database_path('migrations/2026_10_05_000100_office_operations.php'))->backfill();
    expect($b->fresh()->amount_paid_centavos)->toBe(500000);
});

test('admin resource exposes the new fields', function () {
    $b = Booking::factory()->walkIn($this->staff, ['fullName' => 'Lola Nena', 'phone' => '09171234567'])
        ->create(['sacrament' => 'house-blessing', 'status' => 'submitted', 'form_data' => ['propertyOwner' => 'Nena Store']]);
    $this->actingAs($this->staff)->getJson("/api/admin/bookings/{$b->id}")->assertOk()
        ->assertJsonPath('channel', 'walk_in')->assertJsonPath('subjectName', 'Nena Store')
        ->assertJsonPath('user.phone', '09171234567')->assertJsonPath('createdBy.id', $this->staff->id)
        ->assertJsonPath('overpaidCentavos', 0);
});

test('the parish name is a setting', function () {
    ParishSetting::put('parish_name', 'San Pedro Parish');
    $this->getJson('/api/parish')->assertOk()->assertJsonPath('name', 'San Pedro Parish');
});
