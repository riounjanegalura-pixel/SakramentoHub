<?php

use App\Models\AuditLog;
use App\Models\Booking;
use App\Models\User;
use Illuminate\Support\Carbon;

beforeEach(function () {
    $this->seed(\Database\Seeders\ServiceSeeder::class);
    $this->seed(\Database\Seeders\ParishSettingSeeder::class);
    \Illuminate\Support\Carbon::setTestNow(\Illuminate\Support\Carbon::parse('2026-11-02 00:00:00', 'UTC')); // Mon 08:00 Manila
    \Illuminate\Support\Facades\Storage::fake('local');
    $this->staff = \App\Models\User::factory()->create(['role' => 'staff']);
    $this->admin = \App\Models\User::factory()->create(['role' => 'admin']);
});
afterEach(fn () => \Illuminate\Support\Carbon::setTestNow());

function reportBooking(array $attrs, ?string $date = '2026-11-10', string $start = '10:00', string $end = '11:00'): Booking
{
    $factory = Booking::factory();
    if ($date !== null) {
        $factory = $factory->scheduled($date, $start, $end);
    }

    return $factory->create($attrs + ['sacrament' => 'funeral', 'status' => 'approved', 'payment_status' => 'not_required']);
}

test('the summary counts by appointment date and leaves out drafts', function () {
    reportBooking(['status' => 'completed']);
    reportBooking(['status' => 'declined'], start: '13:00', end: '14:00');
    reportBooking(['status' => 'cancelled', 'sacrament' => 'baptism'], start: '15:00', end: '15:45');
    reportBooking(['status' => 'draft']);
    reportBooking([], '2026-12-05');                                   // outside the range
    reportBooking(['channel' => 'walk_in', 'user_id' => null, 'created_by' => $this->staff->id, 'owner_snapshot' => ['fullName' => 'W']], start: '08:00', end: '09:00');

    $json = $this->actingAs($this->staff)->getJson('/api/admin/reports/summary?from=2026-11-01&to=2026-11-30')->assertOk()->json();

    expect($json['totals'])->toMatchArray(['bookings' => 4, 'completed' => 1, 'declined' => 1, 'cancelled' => 1, 'online' => 3, 'walkIn' => 1])
        ->and($json['bySacrament'])->toHaveCount(6);
    $funeral = collect($json['bySacrament'])->firstWhere('sacrament', 'funeral');
    expect($funeral['total'])->toBe(3)->and($funeral['byStatus']['completed'])->toBe(1);
    expect(collect($json['bySacrament'])->firstWhere('sacrament', 'wedding')['total'])->toBe(0);
});

// Review Focus 6
test('an undated urgent request belongs to its Manila request date', function () {
    Carbon::setTestNow(Carbon::parse('2026-11-30 23:30:00', 'UTC')); // 07:30 on Dec 1 in Manila
    reportBooking(['sacrament' => 'anointing', 'status' => 'submitted', 'is_emergency' => true], null);

    $nov = $this->actingAs($this->staff)->getJson('/api/admin/reports/summary?from=2026-11-01&to=2026-11-30')->json('totals');
    $dec = $this->actingAs($this->staff)->getJson('/api/admin/reports/summary?from=2026-12-01&to=2026-12-31')->json('totals');
    expect($nov['bookings'])->toBe(0)->and($dec['bookings'])->toBe(1)->and($dec['urgent'])->toBe(1);
});

test('money is counted by payment and refund date', function () {
    reportBooking(['sacrament' => 'wedding', 'payment_status' => 'paid', 'amount_due_centavos' => 500000, 'amount_paid_centavos' => 500000, 'paid_at' => '2026-11-05 02:00:00'], '2027-03-03', '10:00', '11:30');
    reportBooking(['sacrament' => 'wedding', 'payment_status' => 'paid', 'amount_due_centavos' => 500000, 'amount_paid_centavos' => 500000, 'paid_at' => '2026-10-31 15:00:00'], '2027-03-04', '10:00', '11:30'); // 23:00 Oct 31 Manila
    $due = reportBooking(['status' => 'cancelled', 'payment_status' => 'refund_due', 'amount_due_centavos' => 5000, 'amount_paid_centavos' => 5000, 'paid_at' => '2026-09-01 02:00:00', 'sacrament' => 'baptism'], '2026-09-13');
    reportBooking(['sacrament' => 'baptism', 'payment_status' => 'paid', 'amount_due_centavos' => 5000, 'amount_paid_centavos' => 15000, 'paid_at' => '2026-09-01 02:00:00'], '2026-09-20');
    AuditLog::create(['actor_user_id' => null, 'action' => 'booking.refunded', 'subject_type' => 'booking', 'subject_id' => $due->id, 'metadata' => ['amountCentavos' => 250000], 'created_at' => '2026-11-06 02:00:00']);
    AuditLog::create(['actor_user_id' => null, 'action' => 'booking.partial_refund', 'subject_type' => 'booking', 'subject_id' => $due->id, 'metadata' => ['amountCentavos' => 1000], 'created_at' => '2026-11-07 02:00:00']);

    $this->actingAs($this->staff)->getJson('/api/admin/reports/summary?from=2026-11-01&to=2026-11-30')->assertOk()
        ->assertJsonPath('money.collectedCentavos', 500000)->assertJsonPath('money.refundedCentavos', 251000)
        ->assertJsonPath('money.refundDueCentavos', 5000)->assertJsonPath('money.overpaidCentavos', 10000);
});

test('the summary can be narrowed to one sacrament and validates its range', function () {
    reportBooking([]);
    reportBooking(['sacrament' => 'baptism'], start: '13:00', end: '13:45');
    $this->actingAs($this->staff)->getJson('/api/admin/reports/summary?from=2026-11-01&to=2026-11-30&sacrament=baptism')->assertJsonPath('totals.bookings', 1);
    $this->actingAs($this->staff)->getJson('/api/admin/reports/summary?from=2026-11-01&to=2028-11-30')->assertUnprocessable();
    $this->actingAs($this->staff)->getJson('/api/admin/reports/summary')->assertUnprocessable();
    $this->actingAs(User::factory()->create())->getJson('/api/admin/reports/summary?from=2026-11-01&to=2026-11-30')->assertForbidden();
});

// Review Focus 5
test('the CSV neutralises formulas, escapes punctuation and keeps UTF-8', function () {
    $owner = User::factory()->create(['full_name' => '=SUM(A1)', 'phone' => '+639171234567', 'email' => 'o@example.com']);
    reportBooking(['user_id' => $owner->id, 'form_data' => ['deceasedFirstName' => 'José', 'deceasedLastName' => 'Ñiguez, "Jun"']]);
    reportBooking(['form_data' => ['deceasedFirstName' => '@cmd', 'deceasedLastName' => 'X']], start: '13:00', end: '14:00');

    $response = $this->actingAs($this->staff)->get('/api/admin/reports/bookings.csv?from=2026-11-01&to=2026-11-30')->assertOk();
    expect($response->headers->get('content-type'))->toContain('text/csv')
        ->and($response->headers->get('content-disposition'))->toContain('bookings-2026-11-01-to-2026-11-30.csv');

    $csv = $response->streamedContent();
    expect(str_starts_with($csv, "\xEF\xBB\xBF"))->toBeTrue();
    $rows = array_map('str_getcsv', array_filter(explode("\n", trim(substr($csv, 3)))));
    expect($rows[0])->toBe(['Reference', 'Service', 'For', 'Contact', 'Phone', 'Email', 'Date', 'Start', 'End', 'Status', 'Payment', 'Fee', 'Paid', 'Channel', 'Requested'])
        ->and($rows)->toHaveCount(3)
        ->and($rows[1][2])->toBe('José Ñiguez, "Jun"')->and($rows[1][3])->toBe("'=SUM(A1)")->and($rows[1][4])->toBe("'+639171234567")
        ->and($rows[2][2])->toBe("'@cmd X")->and($rows[1][9])->toBe('Approved');

    $meta = AuditLog::where('action', 'report.exported')->first()->metadata;
    expect($meta['rows'])->toBe(2)->and($meta['from'])->toBe('2026-11-01');
});

test('the CSV guard looks past leading spaces and tabs', function () {
    foreach (['  =1+1', " 	@cmd", '  Ana'] as $k => $name) {
        reportBooking(['user_id' => User::factory()->create(['full_name' => $name])->id], start: sprintf('%02d:00', 9 + $k), end: sprintf('%02d:45', 9 + $k));
    }

    $csv = $this->actingAs($this->staff)->get('/api/admin/reports/bookings.csv?from=2026-11-01&to=2026-11-30')->assertOk()->streamedContent();
    $rows = array_map('str_getcsv', array_filter(explode("
", trim(substr($csv, 3)))));
    $contacts = collect($rows)->skip(1)->pluck(3)->all();

    fwrite(STDERR, "
");
    expect($contacts)->toContain("'  =1+1")->toContain("' 	@cmd")->toContain('  Ana');
});

test('the queue filters by payment, channel, date range and overpayment', function () {
    reportBooking(['payment_status' => 'refund_due', 'status' => 'cancelled']);
    reportBooking(['channel' => 'walk_in', 'user_id' => null, 'created_by' => $this->staff->id, 'owner_snapshot' => ['fullName' => 'W']], start: '13:00', end: '14:00');
    reportBooking(['sacrament' => 'baptism', 'payment_status' => 'paid', 'amount_due_centavos' => 5000, 'amount_paid_centavos' => 15000], '2026-12-06');

    $q = fn (string $qs) => $this->actingAs($this->staff)->getJson("/api/admin/bookings?{$qs}")->assertOk()->json('meta.total');
    expect($q('paymentStatus=refund_due'))->toBe(1)->and($q('channel=walk_in'))->toBe(1)
        ->and($q('from=2026-12-01&to=2026-12-31'))->toBe(1)->and($q('attention=overpaid'))->toBe(1);
    $this->actingAs($this->staff)->getJson('/api/admin/bookings/counts?channel=walk_in')->assertJsonPath('total', 1);
    $this->actingAs($this->staff)->getJson('/api/admin/bookings?from=2026-12-01')->assertUnprocessable(); // from needs to
});

test('searching without a status filter finds drafts; browsing still hides them', function () {
    $draft = reportBooking(['status' => 'draft']);
    $this->actingAs($this->staff)->getJson('/api/admin/bookings')->assertJsonPath('meta.total', 0);
    $this->actingAs($this->staff)->getJson('/api/admin/bookings?search='.$draft->reference_number)->assertJsonPath('meta.total', 1);
    $this->actingAs($this->staff)->getJson('/api/admin/bookings/counts?search='.$draft->reference_number)->assertJsonPath('total', 1);
});

test('the dashboard lists what needs attention', function () {
    reportBooking(['status' => 'submitted'], '2026-11-02', '14:00', '15:00');                                                     // awaiting review + today
    reportBooking(['sacrament' => 'anointing', 'status' => 'submitted', 'is_emergency' => true], null);                             // urgent
    reportBooking(['status' => 'cancelled', 'payment_status' => 'refund_due']);                                                      // refund due
    reportBooking(['sacrament' => 'baptism', 'payment_status' => 'paid', 'amount_due_centavos' => 5000, 'amount_paid_centavos' => 15000], '2026-11-15'); // overpaid
    reportBooking(['sacrament' => 'wedding', 'status' => 'submitted', 'payment_status' => 'unpaid', 'payment_hold_expires_at' => now()->addHours(6)], '2027-03-03', '10:00', '11:30'); // hold ending soon
    reportBooking(['status' => 'draft']);

    $json = $this->actingAs($this->staff)->getJson('/api/admin/analytics')->assertOk()->json();
    expect($json['attention'])->toBe(['awaitingReview' => 3, 'urgentOpen' => 1, 'refundDue' => 1, 'overpaid' => 1, 'todayAppointments' => 1, 'holdsExpiringSoon' => 1, 'certificateRequests' => 0])
        ->and($json['byStatus'])->not->toHaveKey('draft');
});

test('payment holds expiring soon count cash-at-the-office holds as well as unpaid ones', function () {
    reportBooking(['sacrament' => 'wedding', 'status' => 'submitted', 'payment_status' => 'unpaid', 'payment_hold_expires_at' => now()->addHours(6)], '2027-03-03', '10:00', '11:30');
    reportBooking(['sacrament' => 'wedding', 'status' => 'submitted', 'payment_status' => 'pending_cash', 'payment_method' => 'cash', 'payment_hold_expires_at' => now()->addHours(3)], '2027-03-10', '10:00', '11:30');
    reportBooking(['sacrament' => 'wedding', 'status' => 'submitted', 'payment_status' => 'pending_cash', 'payment_method' => 'cash', 'payment_hold_expires_at' => now()->addHours(30)], '2027-03-17', '10:00', '11:30'); // not within 12 hours
    reportBooking(['sacrament' => 'wedding', 'status' => 'submitted', 'payment_status' => 'paid', 'payment_hold_expires_at' => now()->addHours(3)], '2027-03-24', '10:00', '11:30'); // paid: no hold to watch

    $this->actingAs($this->staff)->getJson('/api/admin/analytics')->assertOk()->assertJsonPath('attention.holdsExpiringSoon', 2);
});

// Lead amendment L1
test('the queue page size can be raised to 100 and no further', function () {
    Booking::factory()->count(3)->create(['sacrament' => 'baptism', 'status' => 'submitted']);
    $this->actingAs($this->staff)->getJson('/api/admin/bookings')->assertJsonPath('meta.per_page', 15);
    $this->actingAs($this->staff)->getJson('/api/admin/bookings?perPage=2')->assertJsonPath('meta.per_page', 2)->assertJsonCount(2, 'data');
    $this->actingAs($this->staff)->getJson('/api/admin/bookings?perPage=100&priority=1')->assertOk()->assertJsonPath('meta.per_page', 100);
    $this->actingAs($this->staff)->getJson('/api/admin/bookings?perPage=101')->assertUnprocessable();
    $this->actingAs($this->staff)->getJson('/api/admin/bookings?perPage=0')->assertUnprocessable();
});


test('the summary carries monthly series, weekdays, gifts, certificates and the previous period', function () {
    reportBooking(['status' => 'completed'], '2026-11-10');                  // Tuesday
    reportBooking(['status' => 'approved'], '2026-10-12', '10:00', '11:00'); // Monday, in range
    reportBooking(['status' => 'completed'], '2026-09-14');                  // previous period
    $donor = User::factory()->create();
    \App\Models\Donation::create(['user_id' => $donor->id, 'amount_centavos' => 50000, 'status' => 'paid', 'paid_at' => '2026-11-05 02:00:00']);
    \App\Models\Donation::create(['user_id' => $donor->id, 'amount_centavos' => 30000, 'status' => 'pending']);
    \App\Models\Donation::create(['user_id' => $donor->id, 'amount_centavos' => 20000, 'status' => 'paid', 'paid_at' => '2026-09-20 02:00:00']);
    $cert = fn (string $closed) => \Illuminate\Support\Facades\DB::table('certificate_requests')->insert([
        'id' => (string) \Illuminate\Support\Str::uuid(), 'reference_number' => 'CERT-'.\Illuminate\Support\Str::random(8), 'sacrament' => 'baptism',
        'person_name' => 'X', 'sacrament_date_text' => '2000', 'relationship' => 'self', 'purpose' => 'x', 'status' => 'issued',
        'closed_at' => $closed, 'created_at' => $closed, 'updated_at' => $closed,
    ]);
    $cert('2026-11-06 02:00:00');
    $cert('2026-09-06 02:00:00');

    $json = $this->actingAs($this->staff)->getJson('/api/admin/reports/summary?from=2026-10-01&to=2026-11-30')->assertOk()->json();

    expect(collect($json['monthly'])->pluck('month')->all())->toBe(['2026-10', '2026-11'])
        ->and($json['monthly'][0]['bookings'])->toBe(1)
        ->and($json['monthly'][1]['byStatus']['completed'])->toBe(1)
        ->and($json['monthly'][1]['donationsCentavos'])->toBe(50000)
        ->and($json['monthly'][1]['certificatesIssued'])->toBe(1)
        ->and($json['byWeekday'])->toBe([1, 1, 0, 0, 0, 0, 0])
        ->and($json['donations'])->toBe(['totalCentavos' => 50000, 'count' => 1])
        ->and($json['certificates'])->toBe(['issued' => 1]);
    expect($json['previous']['range'])->toBe(['from' => '2026-08-01', 'to' => '2026-09-30'])
        ->and($json['previous']['bookings'])->toBe(1)->and($json['previous']['completed'])->toBe(1)
        ->and($json['previous']['donationsCentavos'])->toBe(20000)->and($json['previous']['certificatesIssued'])->toBe(1);
});

test('the Excel export is a real workbook with a Summary and a Register sheet, and a phone keeps its leading zero', function () {
    $owner = User::factory()->create(['full_name' => 'Ana Reyes', 'phone' => '09612345678', 'email' => 'ana@example.com']);
    reportBooking(['user_id' => $owner->id, 'form_data' => ['deceasedFirstName' => 'José', 'deceasedLastName' => 'Ñiguez']]);

    $response = $this->actingAs($this->staff)->get('/api/admin/reports/bookings.xlsx?from=2026-11-01&to=2026-11-30')->assertOk();
    expect($response->headers->get('content-type'))->toContain('spreadsheetml.sheet')
        ->and($response->headers->get('content-disposition'))->toContain('bookings-2026-11-01-to-2026-11-30.xlsx');

    $file = tempnam(sys_get_temp_dir(), 'xlsx');
    file_put_contents($file, $response->streamedContent());
    $zip = new ZipArchive();
    expect($zip->open($file))->toBeTrue();
    $workbook = $zip->getFromName('xl/workbook.xml');
    $register = $zip->getFromName('xl/worksheets/sheet2.xml');
    $summary = $zip->getFromName('xl/worksheets/sheet1.xml');
    $zip->close();
    unlink($file);

    expect($workbook)->toContain('Summary')->toContain('Register')
        ->and($register)->toContain('09612345678')->toContain('José Ñiguez')->toContain('<pane')
        ->and($summary)->toContain('Bookings report')->toContain('<mergeCell ');

    expect(AuditLog::where('action', 'report.exported')->first()->metadata['format'])->toBe('xlsx');
});

test('a phone in the CSV is spaced so Excel keeps the leading zero', function () {
    $owner = User::factory()->create(['phone' => '09612345678']);
    reportBooking(['user_id' => $owner->id]);

    $csv = $this->actingAs($this->staff)->get('/api/admin/reports/bookings.csv?from=2026-11-01&to=2026-11-30')->streamedContent();
    expect($csv)->toContain('0961 234 5678');
});
