<?php

use App\Models\AppNotification;
use App\Models\AuditLog;
use App\Models\Booking;
use App\Models\User;
use App\Services\Booking\BookingStateMachine;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;

beforeEach(function () {
    $this->seed(\Database\Seeders\ServiceSeeder::class);
    $this->seed(\Database\Seeders\ParishSettingSeeder::class);
    Carbon::setTestNow(Carbon::parse('2026-11-02 00:00:00', 'UTC')); // Mon 08:00 Manila
    Storage::fake('local');
    $this->staff = User::factory()->create(['role' => 'staff']);
    $this->admin = User::factory()->create(['role' => 'admin']);
});

afterEach(fn () => Carbon::setTestNow());

function walkInPayload(User $staff, string $fixture = 'funeral/valid-basic', array $extra = []): array
{
    return array_merge([
        'sacrament' => explode('/', $fixture)[0],
        'contact' => ['fullName' => 'Lola Nena Cruz', 'phone' => '09171234567'],
        'formData' => formDataFixture($fixture, $staff->id), // staff uploaded the files
        'appointmentDate' => '2026-11-03',
        'appointmentStart' => '10:00',
    ], $extra);
}

function fakePayMongoCheckout(string $id = 'cs_w1'): void
{
    config(['paymongo.secret_key' => 'sk_test_x', 'paymongo.base_url' => 'https://api.paymongo.com/v1', 'app.parishioner_url' => 'https://app.test']);
    Http::preventStrayRequests();
    Http::fake(['api.paymongo.com/*' => Http::response(['data' => ['id' => $id, 'attributes' => ['checkout_url' => "https://pay.test/{$id}", 'status' => 'active']]])]);
}

test('staff create a walk-in draft with no account', function () {
    $this->actingAs($this->staff)->postJson('/api/admin/walk-ins', walkInPayload($this->staff))
        ->assertCreated()->assertJsonPath('status', 'draft')->assertJsonPath('channel', 'walk_in')
        ->assertJsonPath('userId', null)->assertJsonPath('user.fullName', 'Lola Nena Cruz')
        ->assertJsonPath('user.email', null)
        ->assertJsonPath('user.phone', '09171234567')->assertJsonPath('createdBy.id', $this->staff->id)
        ->assertJsonPath('appointmentEnd', '11:00');
});

test('the desk may send a null email and a null link', function () {
    $payload = walkInPayload($this->staff, extra: ['contact' => ['fullName' => 'Lola Nena Cruz', 'phone' => '09171234567', 'email' => null], 'linkUserId' => null]);
    $this->actingAs($this->staff)->postJson('/api/admin/walk-ins', $payload)->assertCreated()->assertJsonPath('userId', null);
});

test('contact name and a PH mobile number are required', function () {
    $this->actingAs($this->staff)->postJson('/api/admin/walk-ins', walkInPayload($this->staff, extra: ['contact' => ['fullName' => '', 'phone' => '123']]))
        ->assertUnprocessable()->assertJsonValidationErrors(['contact.fullName', 'contact.phone']);
});

test('two walk-in drafts for the same sacrament are two bookings', function () {
    $this->actingAs($this->staff)->postJson('/api/admin/walk-ins', walkInPayload($this->staff))->assertCreated();
    $this->actingAs($this->staff)->postJson('/api/admin/walk-ins', walkInPayload($this->staff, extra: ['contact' => ['fullName' => 'Mang Tino', 'phone' => '09181234567']]))->assertCreated();
    expect(Booking::where('channel', 'walk_in')->count())->toBe(2);
});

// Review Focus 3
test('a walk-in with no email goes from submit to certificate without an account', function () {
    $id = $this->actingAs($this->staff)->postJson('/api/admin/walk-ins', walkInPayload($this->staff))->json('id');

    $this->actingAs($this->staff)->patchJson("/api/admin/walk-ins/{$id}/submit")->assertOk()
        ->assertJsonPath('status', 'submitted')->assertJsonPath('paymentStatus', 'not_required');
    acceptAllDocuments(Booking::find($id));
    $this->actingAs($this->staff)->patchJson("/api/admin/bookings/{$id}/approve")->assertOk();

    Carbon::setTestNow(Carbon::parse('2026-11-03 04:00:00', 'UTC'));
    $this->actingAs($this->staff)->patchJson("/api/admin/bookings/{$id}/complete")->assertOk();
    $this->actingAs($this->staff)->get("/api/admin/bookings/{$id}/certificate")->assertOk()->assertSee('Lorenzo Pascual');
});

// Review Focus 3: the fee path — payment link, payment, approval and notifications with no email and no account.
test('a paying walk-in with no email gets a link, pays, and is approved without anyone to notify by account', function () {
    fakePayMongoCheckout();
    $payload = walkInPayload($this->staff, 'wedding/valid-basic', ['appointmentDate' => '2027-03-03', 'appointmentStart' => '09:30']);
    $id = $this->actingAs($this->staff)->postJson('/api/admin/walk-ins', $payload)->assertCreated()->json('id');

    $this->actingAs($this->staff)->patchJson("/api/admin/walk-ins/{$id}/submit")->assertOk()
        ->assertJsonPath('paymentStatus', 'unpaid')->assertJsonPath('amountDueCentavos', 500000);

    $this->actingAs($this->staff)->postJson("/api/admin/bookings/{$id}/payment")->assertOk()
        ->assertJsonPath('checkoutUrl', 'https://pay.test/cs_w1');
    Http::assertSent(function ($request) {
        $billing = $request->data()['data']['attributes']['billing'] ?? [];

        return $billing === ['name' => 'Lola Nena Cruz']; // no email key at all
    });

    $booking = Booking::find($id);
    expect(app(BookingStateMachine::class)->recordPayment($booking, 'cs_w1', 'pay_w1', 500000, 'evt_w1'))->toBe('processed');
    acceptAllDocuments($booking);
    $this->actingAs($this->staff)->patchJson("/api/admin/bookings/{$id}/approve")->assertOk()->assertJsonPath('status', 'approved');

    Carbon::setTestNow(Carbon::parse('2027-03-03 06:00:00', 'UTC'));
    completeWeddingPreparation($booking); // the interview, Pre-Cana, banns and license the office ticks before the day
    $this->actingAs($this->staff)->patchJson("/api/admin/bookings/{$id}/complete")->assertOk();

    // Owner notifications have nobody to go to; nothing was written against a null user.
    expect(AppNotification::whereNull('user_id')->count())->toBe(0);
});

test('an urgent anointing walk-in alerts staff with the walk-in contact phone', function () {
    $payload = walkInPayload($this->staff, 'anointing/valid-hospital', ['appointmentDate' => null, 'appointmentStart' => null]);
    $payload['formData']['inDangerOfDeath'] = true;
    $id = $this->actingAs($this->staff)->postJson('/api/admin/walk-ins', $payload)->json('id');

    $this->actingAs($this->staff)->patchJson("/api/admin/walk-ins/{$id}/submit")->assertOk()->assertJsonPath('isEmergency', true);

    $alert = AppNotification::where('user_id', $this->admin->id)->where('title', 'Urgent anointing request')->first();
    expect($alert)->not->toBeNull()->and($alert->body)->toContain('09171234567');
});

test('walk-in submit enforces the same validation as online', function () {
    $payload = walkInPayload($this->staff);
    unset($payload['formData']['deathCertificate']);
    $id = $this->actingAs($this->staff)->postJson('/api/admin/walk-ins', $payload)->json('id');
    $this->actingAs($this->staff)->patchJson("/api/admin/walk-ins/{$id}/submit")->assertUnprocessable()->assertJsonValidationErrors(['formData.deathCertificate']);
});

test('a walk-in cannot use a document another account uploaded', function () {
    $stranger = User::factory()->create();
    $payload = walkInPayload($this->staff, extra: ['formData' => formDataFixture('funeral/valid-basic', $stranger->id)]);
    $id = $this->actingAs($this->staff)->postJson('/api/admin/walk-ins', $payload)->json('id');
    $this->actingAs($this->staff)->patchJson("/api/admin/walk-ins/{$id}/submit")->assertUnprocessable()->assertJsonValidationErrors(['formData.deathCertificate']);
});

test('walk-in submit cannot double-book the priest', function () {
    Booking::factory()->scheduled('2026-11-03', '10:00', '11:00')->create(['sacrament' => 'funeral', 'status' => 'approved', 'payment_status' => 'not_required']);
    $id = $this->actingAs($this->staff)->postJson('/api/admin/walk-ins', walkInPayload($this->staff))->json('id');
    $this->actingAs($this->staff)->patchJson("/api/admin/walk-ins/{$id}/submit")->assertUnprocessable()
        ->assertJsonPath('message', 'That time is no longer available. Please choose another.');
});

test('lead time can be waived for a walk-in with a reason, and only by staff', function () {
    $payload = walkInPayload($this->staff, 'house-blessing/valid-house', ['appointmentDate' => '2026-11-03', 'appointmentStart' => '10:15']);
    $id = $this->actingAs($this->staff)->postJson('/api/admin/walk-ins', $payload)->json('id');

    $this->actingAs($this->staff)->patchJson("/api/admin/walk-ins/{$id}/submit")->assertUnprocessable(); // 3-day lead time
    $this->actingAs($this->staff)->patchJson("/api/admin/walk-ins/{$id}/submit", ['waiveLeadTime' => true])->assertUnprocessable()->assertJsonValidationErrors(['waiveReason']);
    $this->actingAs($this->staff)->patchJson("/api/admin/walk-ins/{$id}/submit", ['waiveLeadTime' => true, 'waiveReason' => 'Moving in tomorrow'])->assertOk();

    $meta = AuditLog::where('action', 'booking.submitted')->where('subject_id', $id)->first()->metadata;
    expect($meta['leadTimeWaived'])->toBeTrue()->and($meta['waiveReason'])->toBe('Moving in tomorrow');
});

test('a waiver never lifts the other rules', function () {
    // 2026-11-08 is a Sunday: house blessings run Tuesday to Saturday.
    $payload = walkInPayload($this->staff, 'house-blessing/valid-house', ['appointmentDate' => '2026-11-08', 'appointmentStart' => '10:15']);
    $id = $this->actingAs($this->staff)->postJson('/api/admin/walk-ins', $payload)->json('id');
    $this->actingAs($this->staff)->patchJson("/api/admin/walk-ins/{$id}/submit", ['waiveLeadTime' => true, 'waiveReason' => 'Urgent'])
        ->assertUnprocessable()->assertJsonPath('message', 'House Blessing & Other is not scheduled on Sundays.');
});

test('a submit without a waiver writes no waiver metadata', function () {
    $id = $this->actingAs($this->staff)->postJson('/api/admin/walk-ins', walkInPayload($this->staff))->json('id');
    $this->actingAs($this->staff)->patchJson("/api/admin/walk-ins/{$id}/submit")->assertOk();
    $meta = AuditLog::where('action', 'booking.submitted')->where('subject_id', $id)->first()->metadata;
    expect($meta)->not->toHaveKey('leadTimeWaived');
});

test('an online booking can never use the waiver', function () {
    $owner = User::factory()->create();
    $owner->forceFill(['email_verified_at' => now()])->save();
    $b = Booking::factory()->scheduled('2026-11-03', '10:00', '10:45')->create([
        'user_id' => $owner->id, 'sacrament' => 'house-blessing', 'form_data' => formDataFixture('house-blessing/valid-house', $owner->id),
    ]);
    expect(fn () => app(BookingStateMachine::class)->submit($b, $this->staff, true, 'x'))
        ->toThrow(\App\Exceptions\BookingRuleViolation::class);
});

test('a parishioner actor can never use the waiver, even on a walk-in', function () {
    $owner = User::factory()->create();
    $b = Booking::factory()->walkIn($this->staff)->scheduled('2026-11-03', '10:00', '10:45')->create([
        'user_id' => $owner->id, 'sacrament' => 'house-blessing', 'form_data' => formDataFixture('house-blessing/valid-house', $this->staff->id),
    ]);
    expect(fn () => app(BookingStateMachine::class)->submit($b, $owner, true, 'x'))
        ->toThrow(\App\Exceptions\BookingRuleViolation::class);
});

test('a walk-in is linked to an account only when staff pass the confirmed id', function () {
    $account = User::factory()->create(['email' => 'maria@example.com', 'full_name' => 'Maria Santos']);
    $account->forceFill(['email_verified_at' => now()])->save();

    $this->actingAs($this->staff)->getJson('/api/admin/parishioners/lookup?email=maria@example.com')->assertOk()
        ->assertExactJson(['id' => $account->id, 'fullName' => 'Maria Santos']);
    $this->actingAs($this->staff)->getJson('/api/admin/parishioners/lookup?email=nobody@example.com')->assertNotFound()->assertJsonStructure(['message']);
    $this->actingAs($this->staff)->getJson('/api/admin/parishioners/lookup?email='.$this->admin->email)->assertNotFound(); // staff accounts are not parishioners

    $unlinked = $this->actingAs($this->staff)->postJson('/api/admin/walk-ins', walkInPayload($this->staff, extra: ['contact' => ['fullName' => 'Maria Santos', 'phone' => '09171234567', 'email' => 'maria@example.com']]))->json();
    expect($unlinked['userId'])->toBeNull(); // an email alone never links

    $linked = $this->actingAs($this->staff)->postJson('/api/admin/walk-ins', walkInPayload($this->staff, extra: ['linkUserId' => $account->id, 'appointmentStart' => '13:00']))->json();
    expect($linked['userId'])->toBe($account->id);
    // L11(g): the linked parishioner sees it only once the desk has submitted it.
    $this->actingAs($account)->getJson('/api/bookings')->assertJsonCount(0);
    Booking::find($linked['id'])->update(['status' => 'submitted']);
    $this->actingAs($account)->getJson('/api/bookings')->assertJsonCount(1);
});

test('lookup ignores unverified and deactivated accounts', function () {
    $unverified = User::factory()->unverified()->create(['email' => 'new@example.com']);
    $inactive = User::factory()->create(['email' => 'gone@example.com', 'is_active' => false]);
    $inactive->forceFill(['email_verified_at' => now()])->save();

    $this->actingAs($this->staff)->getJson('/api/admin/parishioners/lookup?email=new@example.com')->assertNotFound();
    $this->actingAs($this->staff)->getJson('/api/admin/parishioners/lookup?email=gone@example.com')->assertNotFound();
});

test('lookup is rate-limited', function () {
    $route = collect(app('router')->getRoutes())->first(fn ($r) => $r->uri() === 'api/admin/parishioners/lookup');
    expect(collect($route->middleware())->contains(fn ($m) => str_starts_with($m, 'throttle:30,1')))->toBeTrue();
});

test('a walk-in cannot be linked to a staff account', function () {
    $this->actingAs($this->staff)->postJson('/api/admin/walk-ins', walkInPayload($this->staff, extra: ['linkUserId' => $this->admin->id]))
        ->assertUnprocessable()->assertJsonValidationErrors(['linkUserId']);
});

test('a parishioner saving their own draft never takes over a linked walk-in draft', function () {
    $account = User::factory()->create();
    $walkInId = $this->actingAs($this->staff)->postJson('/api/admin/walk-ins', walkInPayload($this->staff, extra: ['linkUserId' => $account->id]))->json('id');

    $ownId = $this->actingAs($account)->postJson('/api/bookings', ['sacrament' => 'funeral', 'formData' => ['deceasedFirstName' => 'Other']])->json('id');

    expect($ownId)->not->toBe($walkInId)
        ->and(Booking::find($walkInId)->form_data['deceasedFirstName'])->toBe('Lorenzo');
});

test('only walk-in drafts and returned walk-ins are editable through the walk-in route', function () {
    $online = Booking::factory()->create(['sacrament' => 'funeral']);
    $this->actingAs($this->staff)->patchJson("/api/admin/walk-ins/{$online->id}", ['formData' => []])->assertUnprocessable()->assertJsonStructure(['message']);

    $id = $this->actingAs($this->staff)->postJson('/api/admin/walk-ins', walkInPayload($this->staff))->json('id');
    $this->actingAs($this->staff)->patchJson("/api/admin/walk-ins/{$id}", ['appointmentStart' => '13:00', 'contact' => ['fullName' => 'Lola Nena C.', 'phone' => '09171234567']])
        ->assertOk()->assertJsonPath('appointmentStart', '13:00')->assertJsonPath('appointmentEnd', '14:00')->assertJsonPath('user.fullName', 'Lola Nena C.');
    $this->actingAs($this->staff)->patchJson("/api/admin/walk-ins/{$id}/submit")->assertOk();
    $this->actingAs($this->staff)->patchJson("/api/admin/walk-ins/{$id}", ['appointmentStart' => '14:00'])->assertUnprocessable();
    $this->actingAs($this->staff)->patchJson("/api/admin/walk-ins/{$id}/submit")->assertUnprocessable();
});

test('a returned walk-in is edited and resubmitted at the desk', function () {
    $id = $this->actingAs($this->staff)->postJson('/api/admin/walk-ins', walkInPayload($this->staff))->json('id');
    $this->actingAs($this->staff)->patchJson("/api/admin/walk-ins/{$id}/submit")->assertOk();
    $this->actingAs($this->staff)->patchJson("/api/admin/bookings/{$id}/return", ['note' => 'Fix the burial date'])->assertOk();

    $formData = Booking::find($id)->form_data;
    $formData['burialCemetery'] = 'Balagtas Memorial Park';
    $this->actingAs($this->staff)->patchJson("/api/admin/walk-ins/{$id}", ['formData' => $formData])->assertOk();
    $this->actingAs($this->staff)->patchJson("/api/admin/walk-ins/{$id}/submit")->assertOk()->assertJsonPath('status', 'submitted');
    expect(AuditLog::where('action', 'booking.resubmitted')->where('subject_id', $id)->exists())->toBeTrue();
});

test('a partial contact update needs both name and phone', function () {
    $id = $this->actingAs($this->staff)->postJson('/api/admin/walk-ins', walkInPayload($this->staff))->json('id');
    $this->actingAs($this->staff)->patchJson("/api/admin/walk-ins/{$id}", ['contact' => ['fullName' => 'Only Name']])
        ->assertUnprocessable()->assertJsonValidationErrors(['contact.phone']);
});

test('parishioners cannot reach walk-in routes', function () {
    $user = User::factory()->create();
    $this->actingAs($user)->postJson('/api/admin/walk-ins', walkInPayload($this->staff))->assertForbidden();
    $this->actingAs($user)->getJson('/api/admin/parishioners/lookup?email=a@b.c')->assertForbidden();
    $this->actingAs($user)->postJson('/api/admin/bookings/x/payment')->assertForbidden();
});

test('staff get a GCash link whose return page needs no login for a walk-in', function () {
    fakePayMongoCheckout();

    $b = Booking::factory()->walkIn($this->staff)->scheduled('2027-03-03', '10:00', '11:30')->create([
        'sacrament' => 'wedding', 'status' => 'submitted', 'payment_status' => 'unpaid', 'amount_due_centavos' => 500000, 'payment_hold_expires_at' => now()->addDay(),
    ]);
    $this->actingAs($this->staff)->postJson("/api/admin/bookings/{$b->id}/payment")->assertOk()
        ->assertJsonPath('checkoutUrl', 'https://pay.test/cs_w1')->assertJsonPath('checkoutSessionId', 'cs_w1');

    Http::assertSent(fn ($request) => ($request->data()['data']['attributes']['success_url'] ?? null) === 'https://app.test/payment/received'
        && $request->data()['data']['attributes']['cancel_url'] === 'https://app.test/payment/received?cancelled=1');
    expect($b->fresh()->paymongo_checkout_session_id)->toBe('cs_w1');

    $paid = Booking::factory()->create(['status' => 'submitted', 'payment_status' => 'paid']);
    $this->actingAs($this->staff)->postJson("/api/admin/bookings/{$paid->id}/payment")->assertStatus(409);
});

// L2: the payer at the counter may not be signed in on their phone.
test('a walk-in linked to an account still returns to the public received page', function () {
    fakePayMongoCheckout();
    $account = User::factory()->create();

    $b = Booking::factory()->walkIn($this->staff)->scheduled('2027-03-03', '10:00', '11:30')->create([
        'user_id' => $account->id, 'sacrament' => 'wedding', 'status' => 'submitted', 'payment_status' => 'unpaid',
        'amount_due_centavos' => 500000, 'payment_hold_expires_at' => now()->addDay(),
    ]);
    $this->actingAs($this->staff)->postJson("/api/admin/bookings/{$b->id}/payment")->assertOk();

    Http::assertSent(fn ($request) => $request->data()['data']['attributes']['success_url'] === 'https://app.test/payment/received');
});

test('an online booking still returns to the signed-in success page', function () {
    fakePayMongoCheckout();
    $owner = User::factory()->create();
    $b = Booking::factory()->scheduled('2027-03-03', '10:00', '11:30')->create([
        'user_id' => $owner->id, 'sacrament' => 'wedding', 'status' => 'submitted', 'payment_status' => 'unpaid',
        'amount_due_centavos' => 500000, 'payment_hold_expires_at' => now()->addDay(),
    ]);
    $this->actingAs($this->staff)->postJson("/api/admin/bookings/{$b->id}/payment")->assertOk();

    Http::assertSent(fn ($request) => $request->data()['data']['attributes']['success_url'] === "https://app.test/payment/success?bookingId={$b->id}");
});

test('the staff payment link refuses a lapsed hold, and reports PayMongo being off or failing', function () {
    $lapsed = Booking::factory()->walkIn($this->staff)->create([
        'sacrament' => 'wedding', 'status' => 'submitted', 'payment_status' => 'unpaid', 'amount_due_centavos' => 500000, 'payment_hold_expires_at' => now()->subMinute(),
    ]);
    $this->actingAs($this->staff)->postJson("/api/admin/bookings/{$lapsed->id}/payment")->assertUnprocessable();

    $open = Booking::factory()->walkIn($this->staff)->create([
        'sacrament' => 'wedding', 'status' => 'submitted', 'payment_status' => 'unpaid', 'amount_due_centavos' => 500000, 'payment_hold_expires_at' => now()->addDay(),
    ]);
    config(['paymongo.secret_key' => null]);
    $this->actingAs($this->staff)->postJson("/api/admin/bookings/{$open->id}/payment")->assertStatus(503);

    config(['paymongo.secret_key' => 'sk_test_x']);
    Http::fake(['api.paymongo.com/*' => Http::response(['errors' => [['detail' => 'boom']]], 500)]);
    $this->actingAs($this->staff)->postJson("/api/admin/bookings/{$open->id}/payment")->assertStatus(502);
});

// L4: the desk (C3) and the admin detail (B2–B3) read these keys.
test('the admin booking resource exposes what the desk and detail screens read', function () {
    $b = Booking::factory()->walkIn($this->staff, ['fullName' => 'Lola Nena Cruz', 'phone' => '09171234567'])->create([
        'sacrament' => 'funeral', 'form_data' => formDataFixture('funeral/valid-basic', $this->staff->id),
    ]);

    $json = $this->actingAs($this->staff)->getJson("/api/admin/bookings/{$b->id}")->assertOk()
        ->assertJsonPath('userId', null)->assertJsonPath('channel', 'walk_in')
        ->assertJsonPath('createdBy', ['id' => $this->staff->id, 'fullName' => $this->staff->full_name])
        ->assertJsonPath('user', ['fullName' => 'Lola Nena Cruz', 'email' => null, 'phone' => '09171234567'])
        ->assertJsonPath('paymentHoldExpiresAt', null)
        ->json();

    expect($json)->toHaveKeys(['userId', 'channel', 'createdBy', 'user', 'paymentHoldExpiresAt', 'documents'])
        ->and($json['documents'])->toBeArray()->not->toBeEmpty()
        ->and($json['documents'][0])->toHaveKeys(['key', 'label', 'required', 'url', 'review']);
});

// These routes are public and resolve the caller through the sanctum guard, so each actor is set on it
// directly (the guard keeps the first user it resolved for the whole test otherwise).
test('availability can ignore lead time for staff only', function () {
    $q = '/api/services/house-blessing/availability?date=2026-11-03&waiveLeadTime=1';
    $this->getJson($q)->assertJsonPath('status', 'unavailable');
    $this->actingAs(User::factory()->create(), 'sanctum')->getJson($q)->assertJsonPath('status', 'unavailable');
    $this->actingAs($this->staff, 'sanctum')->getJson($q)->assertOk()->assertJsonPath('reason', null);
});

test('the availability range can ignore lead time for staff only', function () {
    $q = '/api/services/house-blessing/availability-range?start=2026-11-03&end=2026-11-03&waiveLeadTime=1';
    $this->actingAs(User::factory()->create(), 'sanctum')->getJson($q)->assertJsonPath('days.0.status', 'unavailable');
    $this->actingAs($this->staff, 'sanctum')->getJson($q)->assertJsonPath('days.0.reason', null);
});

test('a staff caller may exclude any booking from availability', function () {
    $owner = User::factory()->create();
    $b = Booking::factory()->scheduled('2026-11-10', '10:15', '11:00')->create(['user_id' => $owner->id, 'sacrament' => 'house-blessing', 'status' => 'approved', 'payment_status' => 'not_required', 'is_offsite' => true]);
    $q = "/api/services/house-blessing/availability?date=2026-11-10&excludeBookingId={$b->id}";
    expect($this->actingAs($this->staff, 'sanctum')->getJson($q)->json('freeStarts'))->toContain('10:15');
    expect($this->actingAs(User::factory()->create(), 'sanctum')->getJson($q)->json('freeStarts'))->not->toContain('10:15');
});
