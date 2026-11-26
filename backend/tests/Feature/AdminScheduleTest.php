<?php

use App\Models\BlackoutDate;
use App\Models\Booking;
use App\Models\ParishEvent;
use App\Models\User;

beforeEach(function () {
    $this->seed(\Database\Seeders\ServiceSeeder::class);
    $this->seed(\Database\Seeders\ParishSettingSeeder::class);
    \Illuminate\Support\Carbon::setTestNow(\Illuminate\Support\Carbon::parse('2026-11-02 00:00:00', 'UTC')); // Mon 08:00 Manila
    \Illuminate\Support\Facades\Storage::fake('local');
    $this->staff = \App\Models\User::factory()->create(['role' => 'staff']);
    $this->admin = \App\Models\User::factory()->create(['role' => 'admin']);
});
afterEach(fn () => \Illuminate\Support\Carbon::setTestNow());

function scheduleDay(array $json, string $date): array
{
    return collect($json['days'])->firstWhere('date', $date);
}

test('every day in the range is listed, and bookings that hold a slot appear with their person', function () {
    Booking::factory()->scheduled('2026-11-03', '10:00', '11:00')->create(['sacrament' => 'funeral', 'status' => 'approved', 'payment_status' => 'not_required',
        'form_data' => ['deceasedFirstName' => 'Pedro', 'deceasedLastName' => 'Lim']]);
    Booking::factory()->scheduled('2026-11-03', '13:00', '13:45')->create(['sacrament' => 'house-blessing', 'status' => 'cancelled']);
    Booking::factory()->scheduled('2026-11-03', '15:00', '15:45')->create(['sacrament' => 'house-blessing', 'status' => 'submitted', 'payment_status' => 'unpaid', 'payment_hold_expires_at' => now()->subHour()]);

    $json = $this->actingAs($this->staff)->getJson('/api/admin/schedule?start=2026-11-02&end=2026-11-08')->assertOk()->json();

    expect($json['days'])->toHaveCount(7)->and($json['travelBufferMinutes'])->toBe(30);
    $bookings = collect(scheduleDay($json, '2026-11-03')['items'])->where('type', 'booking')->values();
    expect($bookings)->toHaveCount(1) // cancelled and lapsed-hold bookings do not occupy the priest
        ->and($bookings[0]['subjectName'])->toBe('Pedro Lim')->and($bookings[0]['start'])->toBe('10:00')->and($bookings[0]['end'])->toBe('11:00');
});

test('masses and the baptism session are on the day, sorted by time', function () {
    ParishEvent::create(['title' => 'Sunday Mass', 'date' => \Illuminate\Support\Carbon::parse('2026-11-08 08:00', 'Asia/Manila')->utc(), 'location' => 'Parish church', 'category' => 'mass', 'duration_minutes' => 60]);
    Booking::factory()->scheduled('2026-11-08', '10:00', '11:00')->count(2)->create(['sacrament' => 'baptism', 'status' => 'approved', 'payment_status' => 'paid', 'form_data' => ['scheduleType' => 'regular']]);

    $items = scheduleDay($this->actingAs($this->staff)->getJson('/api/admin/schedule?start=2026-11-08&end=2026-11-08')->json(), '2026-11-08')['items'];

    expect(array_column($items, 'type'))->toBe(['mass', 'session', 'booking', 'booking']);
    expect($items[1])->toMatchArray(['sacrament' => 'baptism', 'start' => '10:00', 'end' => '11:00', 'booked' => 2, 'capacity' => 10]);
    expect($items[2]['inSession'])->toBeTrue();
});

// Review Focus 4
test('a blackout is shown and a booking already on that day still appears', function () {
    Booking::factory()->scheduled('2026-11-04', '10:00', '11:00')->create(['sacrament' => 'funeral', 'status' => 'approved', 'payment_status' => 'not_required']);
    BlackoutDate::create(['date' => '2026-11-04', 'reason' => 'Parish fiesta', 'sacraments' => null]);
    BlackoutDate::create(['date' => '2026-11-05', 'reason' => 'Bishop visit', 'sacraments' => ['wedding', 'baptism']]);

    $json = $this->actingAs($this->staff)->getJson('/api/admin/schedule?start=2026-11-04&end=2026-11-05')->json();
    expect(scheduleDay($json, '2026-11-04')['blackouts'])->toBe([['reason' => 'Parish fiesta', 'appliesTo' => 'All services', 'start' => null, 'end' => null]])
        ->and(collect(scheduleDay($json, '2026-11-04')['items'])->where('type', 'booking'))->toHaveCount(1)
        ->and(scheduleDay($json, '2026-11-05')['blackouts'][0]['appliesTo'])->toBe('Wedding, Baptism');
});

test('the Easter Triduum is marked', function () {
    $json = $this->actingAs($this->staff)->getJson('/api/admin/schedule?start=2027-03-25&end=2027-03-27')->json(); // Easter 2027 = Mar 28
    expect(scheduleDay($json, '2027-03-26')['blackouts'])->toBe([['reason' => 'Good Friday', 'appliesTo' => 'All services except Anointing of the Sick', 'start' => null, 'end' => null]]);
});

test('open emergency anointings are listed as unscheduled', function () {
    $owner = User::factory()->create(['phone' => '09170001111']);
    Booking::factory()->create(['user_id' => $owner->id, 'sacrament' => 'anointing', 'status' => 'submitted', 'payment_status' => 'not_required', 'is_emergency' => true,
        'form_data' => ['patientFirstName' => 'Rosa', 'patientLastName' => 'Tan']]);
    Booking::factory()->create(['sacrament' => 'anointing', 'status' => 'completed', 'is_emergency' => true]);

    $unscheduled = $this->actingAs($this->staff)->getJson('/api/admin/schedule?start=2026-11-02&end=2026-11-02')->json('unscheduled');
    expect($unscheduled)->toHaveCount(1)->and($unscheduled[0]['subjectName'])->toBe('Rosa Tan')->and($unscheduled[0]['contactPhone'])->toBe('09170001111');
});

test('the range is validated and gated', function () {
    $this->actingAs($this->staff)->getJson('/api/admin/schedule?start=2026-11-02&end=2027-02-02')->assertUnprocessable();
    $this->actingAs($this->staff)->getJson('/api/admin/schedule?start=2026-11-05&end=2026-11-02')->assertUnprocessable();
    $this->actingAs($this->staff)->getJson('/api/admin/schedule')->assertUnprocessable();
    $this->actingAs(User::factory()->create())->getJson('/api/admin/schedule?start=2026-11-02&end=2026-11-02')->assertForbidden();
});

test('serialising bookings in the list endpoints does not query document reviews once per booking (L10)', function () {
    $owner = User::factory()->create();
    foreach (range(1, 4) as $i) {
        $b = Booking::factory()->create(['user_id' => $owner->id, 'sacrament' => 'funeral', 'status' => 'submitted', 'payment_status' => 'not_required',
            'form_data' => formDataFixture('funeral/valid-basic', $owner->id)]);
        acceptAllDocuments($b);
    }
    $count = function (string $uri) {
        \Illuminate\Support\Facades\DB::flushQueryLog();
        \Illuminate\Support\Facades\DB::enableQueryLog();
        $this->actingAs($this->staff)->getJson($uri)->assertOk();
        $n = collect(\Illuminate\Support\Facades\DB::getQueryLog())->filter(fn ($q) => str_contains($q['query'], 'booking_document_reviews'))->count();
        \Illuminate\Support\Facades\DB::disableQueryLog();

        return $n;
    };
    expect($count('/api/admin/bookings'))->toBeLessThanOrEqual(1);
    expect($count('/api/admin/bookings?priority=1'))->toBeLessThanOrEqual(1);
    \Illuminate\Support\Facades\DB::flushQueryLog();
    \Illuminate\Support\Facades\DB::enableQueryLog();
    $this->actingAs($owner)->getJson('/api/bookings')->assertOk()->assertJsonPath('0.documents.0.review.status', 'accepted');
    expect(collect(\Illuminate\Support\Facades\DB::getQueryLog())->filter(fn ($q) => str_contains($q['query'], 'booking_document_reviews'))->count())->toBeLessThanOrEqual(1);
});

test('a booking item carries who to call and where the off-site visit is', function () {
    $user = User::factory()->create(['full_name' => 'Maria Pascual', 'phone' => '09175550188']);
    Booking::factory()->scheduled('2026-11-03', '10:00', '11:00')->create([
        'user_id' => $user->id, 'sacrament' => 'funeral', 'status' => 'approved', 'payment_status' => 'not_required', 'is_offsite' => true,
        'form_data' => ['deceasedFirstName' => 'Lorenzo', 'deceasedLastName' => 'Pascual', 'venueAddress' => 'San Juan, Balagtas, Bulacan'],
    ]);
    Booking::factory()->scheduled('2026-11-03', '14:00', '15:00')->create(['user_id' => $user->id, 'sacrament' => 'baptism', 'status' => 'approved', 'payment_status' => 'paid', 'form_data' => ['scheduleType' => 'regular']]);

    $json = $this->actingAs($this->staff)->getJson('/api/admin/schedule?start=2026-11-03&end=2026-11-03')->assertOk()->json();
    $items = collect(scheduleDay($json, '2026-11-03')['items'])->where('type', 'booking')->values();

    expect($items[0])->toMatchArray(['contactName' => 'Maria Pascual', 'contactPhone' => '09175550188', 'location' => 'San Juan, Balagtas, Bulacan']);
    expect($items[1]['location'])->toBeNull();
});
