<?php

use App\Models\Booking;
use App\Models\User;
use Database\Seeders\ParishSettingSeeder;
use Database\Seeders\ServiceSeeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Storage;

beforeEach(function () {
    $this->seed(ServiceSeeder::class);
    $this->seed(ParishSettingSeeder::class);
    Storage::fake('local');
    Carbon::setTestNow(Carbon::parse('2026-11-02 00:00:00', 'UTC'));
    $this->user = User::factory()->create(['email_verified_at' => now()]);
});

afterEach(fn () => Carbon::setTestNow());

test('creates a draft whose empty formData round-trips as an object', function () {
    $response = $this->actingAs($this->user)->postJson('/api/bookings', ['sacrament' => 'baptism', 'formData' => []]);

    $response->assertCreated()->assertJsonPath('status', 'draft')->assertJsonPath('statusLabel', 'Draft');
    expect($response->getContent())->toContain('"formData":{}')
        ->and(Booking::first()->getRawOriginal('form_data'))->toBe('{}');
});

test('stores the appointment outside formData', function () {
    $this->actingAs($this->user)->postJson('/api/bookings', [
        'sacrament' => 'funeral', 'formData' => ['massType' => 'church'],
        'appointmentDate' => '2026-11-03', 'appointmentStart' => '10:00',
    ])->assertCreated()
        ->assertJsonPath('appointmentDate', '2026-11-03')
        ->assertJsonPath('appointmentStart', '10:00')
        ->assertJsonMissingPath('formData.appointmentDate');
});

test('rejects a past or malformed appointment on a draft', function (array $appointment) {
    $this->actingAs($this->user)->postJson('/api/bookings', ['sacrament' => 'funeral', 'formData' => []] + $appointment)
        ->assertUnprocessable();
})->with([
    'past' => [['appointmentDate' => '2026-11-01']],
    'not ISO' => [['appointmentDate' => '11/05/2026']],
    'bad time' => [['appointmentDate' => '2026-11-03', 'appointmentStart' => '10am']],
]);

test('reuses the existing draft for the same sacrament', function () {
    $this->actingAs($this->user)->postJson('/api/bookings', ['sacrament' => 'wedding', 'formData' => ['typeOfMarriage' => 'A']]);
    $this->actingAs($this->user)->postJson('/api/bookings', ['sacrament' => 'wedding', 'formData' => ['typeOfMarriage' => 'B']]);

    expect(Booking::count())->toBe(1)->and(Booking::first()->form_data['typeOfMarriage'])->toBe('B');
});

test('draft shows the live server-computed fee', function () {
    $this->actingAs($this->user)->postJson('/api/bookings', [
        'sacrament' => 'baptism', 'formData' => formDataFixture('baptism/valid-basic', $this->user->id),
    ])->assertJsonPath('amountDueCentavos', 10000);
});

test('a draft or returned booking can be edited, a submitted one cannot', function () {
    $draft = Booking::factory()->create(['user_id' => $this->user->id, 'sacrament' => 'funeral']);
    $this->actingAs($this->user)->patchJson("/api/bookings/{$draft->id}", ['appointmentDate' => '2026-11-04', 'appointmentStart' => '13:00'])
        ->assertOk()->assertJsonPath('appointmentStart', '13:00');

    $submitted = Booking::factory()->create(['user_id' => $this->user->id, 'status' => 'submitted']);
    $this->actingAs($this->user)->patchJson("/api/bookings/{$submitted->id}", ['formData' => []])->assertUnprocessable();
});

test('an explicit null clears the slot on a draft, an absent key leaves it', function () {
    $draft = Booking::factory()->create(['user_id' => $this->user->id, 'sacrament' => 'funeral']);
    $this->actingAs($this->user)->patchJson("/api/bookings/{$draft->id}", ['appointmentDate' => '2026-11-04', 'appointmentStart' => '13:00'])->assertOk();

    $this->actingAs($this->user)->patchJson("/api/bookings/{$draft->id}", ['formData' => ['massType' => 'church']])
        ->assertOk()->assertJsonPath('appointmentStart', '13:00')->assertJsonPath('appointmentDate', '2026-11-04');

    $this->actingAs($this->user)->patchJson("/api/bookings/{$draft->id}", ['appointmentDate' => null, 'appointmentStart' => null])
        ->assertOk()->assertJsonPath('appointmentStart', null)->assertJsonPath('appointmentDate', null)->assertJsonPath('appointmentEnd', null);
});

test('submit requires a verified email', function () {
    $this->user->forceFill(['email_verified_at' => null])->save();
    $draft = Booking::factory()->create(['user_id' => $this->user->id]);

    $this->actingAs($this->user)->patchJson("/api/bookings/{$draft->id}/submit")
        ->assertForbidden()
        ->assertJsonPath('message', 'Please verify your email address before submitting a booking. You can resend the verification email from the banner on your Home screen.');
});

test('submit validates contents and schedules the booking', function () {
    $draft = Booking::factory()->create([
        'user_id' => $this->user->id, 'sacrament' => 'funeral',
        'form_data' => formDataFixture('funeral/valid-basic', $this->user->id),
        'appointment_date' => '2026-11-03', 'appointment_start' => '10:00',
    ]);

    $this->actingAs($this->user)->patchJson("/api/bookings/{$draft->id}/submit")
        ->assertOk()
        ->assertJsonPath('status', 'submitted')
        ->assertJsonPath('paymentStatus', 'not_required')
        ->assertJsonPath('appointmentEnd', '11:00');
});

test('submit reports missing fields under formData', function () {
    $draft = Booking::factory()->create([
        'user_id' => $this->user->id, 'sacrament' => 'funeral', 'form_data' => [],
        'appointment_date' => '2026-11-03', 'appointment_start' => '10:00',
    ]);

    $this->actingAs($this->user)->patchJson("/api/bookings/{$draft->id}/submit")
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['formData.deceasedFirstName', 'formData.deathCertificate']);
});

test('submit refuses a time the priest is already committed', function () {
    Booking::factory()->scheduled('2026-11-03', '10:00', '11:30')->create(['sacrament' => 'wedding', 'status' => 'approved', 'payment_status' => 'paid']);
    $draft = Booking::factory()->create([
        'user_id' => $this->user->id, 'sacrament' => 'funeral',
        'form_data' => formDataFixture('funeral/valid-basic', $this->user->id),
        'appointment_date' => '2026-11-03', 'appointment_start' => '10:30',
    ]);

    $this->actingAs($this->user)->patchJson("/api/bookings/{$draft->id}/submit")
        ->assertUnprocessable()
        ->assertJsonPath('message', 'That time is no longer available. Please choose another.');
});

test('cancel requires a reason and only works on your own booking', function () {
    $mine = Booking::factory()->create(['user_id' => $this->user->id, 'status' => 'draft']);
    $theirs = Booking::factory()->create(['status' => 'draft']);

    $this->actingAs($this->user)->patchJson("/api/bookings/{$mine->id}/cancel")->assertUnprocessable();
    $this->actingAs($this->user)->patchJson("/api/bookings/{$theirs->id}/cancel", ['reason' => 'x'])->assertNotFound();
    $this->actingAs($this->user)->patchJson("/api/bookings/{$mine->id}/cancel", ['reason' => 'Changed plans'])
        ->assertOk()->assertJsonPath('status', 'cancelled')->assertJsonPath('statusReason', 'Changed plans');
});

test('reschedule moves a submitted booking to a free time', function () {
    $b = Booking::factory()->scheduled('2026-11-03', '10:00', '11:00')->create([
        'user_id' => $this->user->id, 'sacrament' => 'funeral', 'status' => 'submitted', 'payment_status' => 'not_required',
        'form_data' => formDataFixture('funeral/valid-basic', $this->user->id),
    ]);

    $this->actingAs($this->user)->patchJson("/api/bookings/{$b->id}/reschedule", ['appointmentDate' => '2026-11-04', 'appointmentStart' => '14:00'])
        ->assertOk()->assertJsonPath('appointmentDate', '2026-11-04')->assertJsonPath('appointmentEnd', '15:00');
});

test('index and show are scoped to the owner and expose the reference number', function () {
    $mine = Booking::factory()->create(['user_id' => $this->user->id]);
    $theirs = Booking::factory()->create();

    $this->actingAs($this->user)->getJson('/api/bookings')->assertOk()->assertJsonCount(1)
        ->assertJsonPath('0.referenceNumber', $mine->reference_number);
    $this->actingAs($this->user)->getJson("/api/bookings/{$theirs->id}")->assertNotFound();
});

test('the legacy receipt-file route is gone', function () {
    $b = Booking::factory()->create(['user_id' => $this->user->id]);
    $this->actingAs($this->user)->getJson("/api/bookings/{$b->id}/receipt-file")->assertNotFound();
});

test('changing the date or start of a draft or returned booking recomputes the end time', function (string $status) {
    $booking = Booking::factory()->scheduled('2026-11-03', '10:00', '11:00')->create([
        'user_id' => $this->user->id, 'sacrament' => 'funeral', 'status' => $status,
        'returned_at' => $status === 'returned' ? now() : null,
    ]);

    $this->actingAs($this->user)->patchJson("/api/bookings/{$booking->id}", ['appointmentStart' => '14:00'])
        ->assertOk()->assertJsonPath('appointmentStart', '14:00')->assertJsonPath('appointmentEnd', '15:00');

    $this->actingAs($this->user)->patchJson("/api/bookings/{$booking->id}", ['appointmentDate' => '2026-11-05'])
        ->assertOk()->assertJsonPath('appointmentDate', '2026-11-05')->assertJsonPath('appointmentEnd', '15:00');

    $this->actingAs($this->user)->patchJson("/api/bookings/{$booking->id}", ['appointmentDate' => null])
        ->assertOk()->assertJsonPath('appointmentStart', '14:00')->assertJsonPath('appointmentEnd', null);
})->with(['draft', 'returned']);

test('a schedule answer that changes the duration recomputes the end time', function () {
    $booking = Booking::factory()->scheduled('2026-11-08', '10:00', '11:00')->create([
        'user_id' => $this->user->id, 'sacrament' => 'baptism', 'form_data' => ['scheduleType' => 'special'],
    ]);
    $expected = fn (array $form) => app(App\Services\Scheduling\SchedulingService::class)->endFor(
        App\Services\Scheduling\AppointmentRequest::make(App\Models\Service::find('baptism'), '2026-11-08', '10:00', $form),
    );

    $this->actingAs($this->user)->patchJson("/api/bookings/{$booking->id}", ['formData' => ['scheduleType' => 'regular']])
        ->assertOk()->assertJsonPath('appointmentEnd', $expected(['scheduleType' => 'regular']));
});
