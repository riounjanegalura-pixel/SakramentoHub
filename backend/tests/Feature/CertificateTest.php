<?php

use App\Models\AppNotification;
use App\Models\Booking;
use App\Models\User;
use Database\Seeders\ServiceSeeder;
use App\Services\Register\ParishRegister;
use Illuminate\Support\Facades\Storage;

// Booking::factory() creates rows with real `sacrament` values, which is now
// a genuine FK onto `services.id` (see 2026_09_05_060000) — seed the real
// services so those inserts don't violate the constraint.
beforeEach(fn () => $this->seed(ServiceSeeder::class));

test('the Booking Completed notification no longer claims a certificate is already available', function () {
    Storage::fake('local');
    $admin = User::factory()->create(['role' => 'admin']);
    $parishioner = User::factory()->create();
    $booking = Booking::factory()->create(['user_id' => $parishioner->id, 'status' => 'approved']);

    $this->actingAs($admin)->patchJson("/api/admin/bookings/{$booking->id}/complete")->assertOk();

    $notification = AppNotification::where('user_id', $parishioner->id)->where('title', 'Sacrament recorded')->first();
    expect($notification->body)->not->toContain('parish office');
});

test('a parishioner can download their own certificate', function () {
    Storage::fake('local');
    $admin = User::factory()->create(['role' => 'admin']);
    $parishioner = User::factory()->create();
    $booking = Booking::factory()->create(['user_id' => $parishioner->id, 'status' => 'completed']);
    app(ParishRegister::class)->record($booking, $admin);

    $response = $this->actingAs($parishioner)->get("/api/bookings/{$booking->id}/certificate");

    $response->assertOk();
    expect($response->headers->get('Content-Type'))->toContain('text/html');
});

test('a parishioner sees a clear 404 if their booking has no register entry yet (a sacrament with no parish form)', function () {
    $parishioner = User::factory()->create();
    $booking = Booking::factory()->create(['user_id' => $parishioner->id, 'sacrament' => 'funeral', 'status' => 'completed']);

    $this->actingAs($parishioner)->getJson("/api/bookings/{$booking->id}/certificate")
        ->assertNotFound()
        ->assertJsonPath('message', 'No certificate yet.');
});

// Renders the certificate for a completed, scheduled booking built from a shared fixture.
function certificateHtmlFor(string $sacrament, string $fixture): string
{
    Storage::fake('local');
    test()->seed(Database\Seeders\ParishSettingSeeder::class);
    $admin = User::factory()->create(['role' => 'admin']);
    $owner = User::factory()->create();
    $booking = Booking::factory()->scheduled('2026-10-10', '10:00', '11:00')->create([
        'user_id' => $owner->id, 'sacrament' => $sacrament, 'status' => 'completed',
        'form_data' => formDataFixture($fixture, $owner->id),
    ]);

    app(ParishRegister::class)->record($booking, $admin);

    return test()->actingAs($admin)->get("/api/admin/bookings/{$booking->id}/certificate")->getContent();
}

test('a baptism certificate includes the real per-sacrament fields from form_data', function () {
    $html = certificateHtmlFor('baptism', 'baptism/valid-basic');

    expect($html)->toContain('Balagtas, Bulacan')
        ->toContain('Juan Dela Cruz-Santos')
        ->toContain('Ma. Teresa Ñiguez')
        ->toContain('Pedro Reyes, Liza Soriano')
        ->not->toContain('null')->not->toContain('undefined');
});

test('a baptism certificate omits the father row when the father is omitted', function () {
    Storage::fake('local');
    $this->seed(Database\Seeders\ParishSettingSeeder::class);
    $admin = User::factory()->create(['role' => 'admin']);
    $owner = User::factory()->create();
    $booking = Booking::factory()->scheduled('2026-10-10', '10:00', '11:00')->create([
        'user_id' => $owner->id, 'sacrament' => 'baptism', 'status' => 'completed',
        'form_data' => ['childFirstName' => 'Maria', 'childLastName' => 'Santos', 'fatherOmitted' => true, 'motherFirstName' => 'Ana', 'motherLastName' => 'Santos'],
    ]);

    app(ParishRegister::class)->record($booking, $admin);
    $html = $this->actingAs($admin)->get("/api/admin/bookings/{$booking->id}/certificate")->getContent();

    expect($html)->toContain('Maria Santos')->toContain('Ana Santos')->not->toContain('>Father<');
});

test('a wedding certificate includes the groom, bride, and marriage date', function () {
    $html = certificateHtmlFor('wedding', 'wedding/valid-basic');

    expect($html)->toContain('Mark Anthony Garcia')
        ->toContain('Kristine Joy Bautista')
        ->toContain('October 10, 2026')
        ->toContain('St. Peter the Apostle Parish');
});

test('a confirmation certificate includes the confirmand and parents', function () {
    $html = certificateHtmlFor('confirmation', 'confirmation/valid-basic');

    expect($html)->toContain('Andrea Villanueva')
        ->toContain('Ramon Villanueva')
        ->toContain('Celia Ramos');
});

test('a funeral certificate includes the deceased and mass type', function () {
    $html = certificateHtmlFor('funeral', 'funeral/valid-basic');

    expect($html)->toContain('Lorenzo Pascual')->toContain('House Mass')->toContain('Balagtas Public Cemetery');
});

test('an anointing certificate includes the recipient', function () {
    $html = certificateHtmlFor('anointing', 'anointing/valid-hospital');

    expect($html)->toContain('Consolacion Aquino')->toContain('Bulacan Medical Center')
        ->not->toContain('null')->not->toContain('undefined');
});

test('a house-blessing certificate includes the owner and address', function () {
    $html = certificateHtmlFor('house-blessing', 'house-blessing/valid-house');

    expect($html)->toContain('Ricardo Dalisay')->toContain('Wawa, Balagtas, Bulacan');
});

test('a certificate for a booking with no form_data falls back to the account holder without literal null/undefined', function () {
    Storage::fake('local');
    $this->seed(Database\Seeders\ParishSettingSeeder::class);
    $admin = User::factory()->create(['role' => 'admin']);
    $parishioner = User::factory()->create(['full_name' => 'Account Holder']);
    $booking = Booking::factory()->create([
        'user_id' => $parishioner->id,
        'status' => 'completed',
        'sacrament' => 'baptism',
        'form_data' => [],
    ]);

    app(ParishRegister::class)->record($booking, $admin);
    $html = $this->actingAs($admin)->get("/api/admin/bookings/{$booking->id}/certificate")->getContent();

    expect($html)->toContain('Account Holder')->not->toContain('null')->not->toContain('undefined');
});

test('a parishioner cannot download another parishioner\'s certificate', function () {
    Storage::fake('local');
    $admin = User::factory()->create(['role' => 'admin']);
    $owner = User::factory()->create();
    $intruder = User::factory()->create();
    $booking = Booking::factory()->create(['user_id' => $owner->id, 'status' => 'completed']);
    app(ParishRegister::class)->record($booking, $admin);

    // findOrFail scoped to the intruder's own bookings never finds this
    // booking at all, so it 404s rather than leaking a 403 that would
    // confirm the booking exists.
    $this->actingAs($intruder)->getJson("/api/bookings/{$booking->id}/certificate")->assertNotFound();
});

test('certificate names the recipient, the ceremony date and the parish priest', function (string $sacrament, string $fixture, string $recipient, string $statementPart) {
    Illuminate\Support\Facades\Storage::fake('local');
    $this->seed(Database\Seeders\ParishSettingSeeder::class);
    $owner = App\Models\User::factory()->create(['full_name' => 'Account Holder']);
    $staff = App\Models\User::factory()->create(['role' => 'staff']);
    $booking = App\Models\Booking::factory()->scheduled('2026-10-10', '10:00', '11:00')->create([
        'user_id' => $owner->id, 'sacrament' => $sacrament, 'status' => 'completed',
        'form_data' => formDataFixture($fixture, $owner->id),
    ]);

    app(ParishRegister::class)->record($booking, $staff);
    $html = $this->actingAs($staff)->get("/api/admin/bookings/{$booking->id}/certificate")->getContent();

    expect($html)->toContain($recipient)
        ->toContain($statementPart)
        ->toContain('October 10, 2026')
        ->toContain('Rev. Fr. Leopoldo S. Evangelista')
        ->not->toContain('Account Holder');
})->with([
    ['baptism', 'baptism/valid-basic', 'José Miguel Ñiguez Dela Cruz-Santos Jr.', 'was baptized'],
    ['confirmation', 'confirmation/valid-basic', 'Andrea Villanueva', 'received the Sacrament of Confirmation'],
    ['wedding', 'wedding/valid-basic', 'Mark Anthony Garcia &amp; Kristine Joy Bautista', 'were united in Holy Matrimony'],
    ['funeral', 'funeral/valid-basic', 'Lorenzo Pascual', 'was commended to God'],
    ['anointing', 'anointing/valid-hospital', 'Consolacion Aquino', 'received the Sacrament of the Anointing of the Sick'],
    ['house-blessing', 'house-blessing/valid-house', 'Ricardo Dalisay', 'was blessed'],
]);

test('a house-blessing certificate reads as a sentence and describes an "other" property', function () {
    Storage::fake('local');
    $this->seed(Database\Seeders\ParishSettingSeeder::class);
    $staff = User::factory()->create(['role' => 'staff']);
    $owner = User::factory()->create();
    $booking = Booking::factory()->scheduled('2026-10-10', '10:00', '11:00')->create([
        'user_id' => $owner->id, 'sacrament' => 'house-blessing', 'status' => 'completed',
        'form_data' => [
            'bookingFor' => 'self', 'propertyType' => 'other', 'propertyOwner' => 'Ricardo Dalisay',
            'propertyDescription' => 'Fishing boat "Bituin"', 'propertyAddress' => 'Wawa, Balagtas, Bulacan',
        ],
    ]);

    app(ParishRegister::class)->record($booking, $staff);
    $html = $this->actingAs($staff)->get("/api/admin/bookings/{$booking->id}/certificate")->getContent();

    expect($html)->toContain('is the owner of the property described below, which was blessed on October 10, 2026.')
        ->not->toContain('had the property described below')
        ->toContain('Fishing boat &quot;Bituin&quot;');
});


// --- the parish form, filled in from the booking's answers, as soon as it is submitted --------------------------------

function submittedFor(string $sacrament, string $fixture, string $status = 'submitted', array $extra = []): array
{
    test()->seed(Database\Seeders\ParishSettingSeeder::class);
    $owner = User::factory()->create(['phone' => '09171234567']);
    $booking = Booking::factory()->scheduled('2026-12-12', '09:00', '10:00')->create([
        'user_id' => $owner->id, 'sacrament' => $sacrament, 'status' => $status,
        'form_data' => array_merge(formDataFixture($fixture, $owner->id), $extra),
    ]);

    return [$owner, $booking];
}

test('a submitted baptism has the parish registration form filled in from the answers', function () {
    [$owner, $booking] = submittedFor('baptism', 'baptism/valid-basic');

    $html = test()->actingAs($owner)->get("/api/bookings/{$booking->id}/certificate")->assertOk()->getContent();

    expect($html)->toContain('Registration for Baptism')
        ->toContain('Diocese of Malolos')
        ->toContain('José Miguel')->toContain('Dela Cruz-Santos')
        ->toContain('Juan')->toContain('Ma. Teresa')
        ->toContain('Pedro Reyes')->toContain('Liza Soriano')
        ->toContain('December 12, 2026')->toContain('9:00 AM')
        ->toContain('09171234567')
        ->not->toContain('becomes official only when the parish writes it into the register') // the notice box is gone
        ->not->toContain('class="notice"');
});

test('a baptism with a parent left out says so instead of printing blanks', function () {
    [$owner, $booking] = submittedFor('baptism', 'baptism/valid-basic', 'submitted', ['motherOmitted' => true, 'motherOmittedReason' => 'Estranged / uncontactable']);

    $html = test()->actingAs($owner)->get("/api/bookings/{$booking->id}/certificate")->assertOk()->getContent();

    expect($html)->toContain("Mother's details left out: Estranged / uncontactable")->not->toContain('Ma. Teresa');
});

test('a submitted wedding has the marriage certificate filled in for husband and wife', function () {
    [$owner, $booking] = submittedFor('wedding', 'wedding/valid-basic', 'approved');

    $html = test()->actingAs($owner)->get("/api/bookings/{$booking->id}/certificate")->assertOk()->getContent();

    expect($html)->toContain('Certificate of Marriage')
        ->toContain('Mark Anthony Garcia')->toContain('Kristine Joy Bautista')
        ->toContain('Malolos City, Bulacan')->toContain('Widowed')
        ->toContain('Antonio Garcia')->toContain('Norma Cruz')
        ->toContain('Arturo Santos')
        ->toContain('12 December 2026');
});

test('there is no filled-in form for a draft, a declined booking or a sacrament without a parish form', function () {
    [$owner, $draft] = submittedFor('baptism', 'baptism/valid-basic', 'draft');
    test()->actingAs($owner)->getJson("/api/bookings/{$draft->id}/certificate")->assertNotFound();

    [$owner2, $declined] = submittedFor('baptism', 'baptism/valid-basic', 'declined');
    test()->actingAs($owner2)->getJson("/api/bookings/{$declined->id}/certificate")->assertNotFound();

    [$owner3, $funeral] = submittedFor('funeral', 'funeral/valid-basic');
    test()->actingAs($owner3)->getJson("/api/bookings/{$funeral->id}/certificate")->assertNotFound();
});

test('nobody else can open the filled-in form of a booking that is not theirs', function () {
    [, $booking] = submittedFor('baptism', 'baptism/valid-basic');
    $stranger = User::factory()->create();

    test()->actingAs($stranger)->getJson("/api/bookings/{$booking->id}/certificate")->assertNotFound();
});

test('the office can open the same filled-in form from the booking', function () {
    [, $booking] = submittedFor('baptism', 'baptism/valid-basic');
    $admin = User::factory()->create(['role' => 'admin']);

    test()->actingAs($admin)->get("/api/admin/bookings/{$booking->id}/certificate")->assertOk()->assertSee('Registration for Baptism');
});
