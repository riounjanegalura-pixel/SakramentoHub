<?php

use App\Models\AuditLog;
use App\Models\Booking;
use App\Models\User;
use Database\Seeders\ServiceSeeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

beforeEach(function () {
    $this->seed(ServiceSeeder::class);
    Storage::fake('local');
    $this->staff = User::factory()->create(['role' => 'staff']);
});

function ageBooking(Booking $b, int $hours): Booking
{
    DB::table('bookings')->where('id', $b->id)->update(['updated_at' => now()->subHours($hours)]);

    return $b;
}

function staffFile(User $staff, string $name): string
{
    Storage::disk('local')->put("documents/{$staff->id}/{$name}", 'x');

    return "/documents/{$staff->id}/{$name}";
}

test('deletes only old walk-in drafts and the files nothing else uses', function () {
    $old = ageBooking(Booking::factory()->walkIn($this->staff)->create(['status' => 'draft', 'form_data' => ['deathCertificate' => staffFile($this->staff, 'old.pdf')]]), 25);
    $shared = staffFile($this->staff, 'shared.pdf');
    $oldShared = ageBooking(Booking::factory()->walkIn($this->staff)->create(['status' => 'draft', 'form_data' => ['deathCertificate' => $shared]]), 30);
    Booking::factory()->create(['status' => 'submitted', 'form_data' => ['deathCertificate' => $shared]]); // another booking uses it

    $fresh = Booking::factory()->walkIn($this->staff)->create(['status' => 'draft', 'form_data' => ['deathCertificate' => staffFile($this->staff, 'fresh.pdf')]]);
    $onlineDraft = ageBooking(Booking::factory()->create(['status' => 'draft', 'form_data' => ['deathCertificate' => staffFile($this->staff, 'online.pdf')]]), 100);
    $submittedWalkIn = ageBooking(Booking::factory()->walkIn($this->staff)->create(['status' => 'submitted']), 100);

    $this->artisan('bookings:prune-walk-in-drafts')->expectsOutputToContain('Deleted 2 walk-in draft(s).')->assertSuccessful();

    expect(Booking::find($old->id))->toBeNull()->and(Booking::find($oldShared->id))->toBeNull()
        ->and(Booking::find($fresh->id))->not->toBeNull()->and(Booking::find($onlineDraft->id))->not->toBeNull()
        ->and(Booking::find($submittedWalkIn->id))->not->toBeNull();
    Storage::disk('local')->assertMissing("documents/{$this->staff->id}/old.pdf");
    Storage::disk('local')->assertExists("documents/{$this->staff->id}/shared.pdf");
    Storage::disk('local')->assertExists("documents/{$this->staff->id}/fresh.pdf");
    Storage::disk('local')->assertExists("documents/{$this->staff->id}/online.pdf");
});

test('a run that deletes drafts is audited once with the count', function () {
    ageBooking(Booking::factory()->walkIn($this->staff)->create(['status' => 'draft']), 48);
    ageBooking(Booking::factory()->walkIn($this->staff)->create(['status' => 'draft']), 48);

    $this->artisan('bookings:prune-walk-in-drafts')->assertSuccessful();

    $rows = AuditLog::where('action', 'walk_in_drafts.pruned')->get();
    expect($rows)->toHaveCount(1)->and($rows[0]->metadata['count'])->toBe(2)->and($rows[0]->actor_user_id)->toBeNull();
});

test('a run with nothing to delete says so and writes no audit row', function () {
    $this->artisan('bookings:prune-walk-in-drafts')->expectsOutputToContain('Deleted 0 walk-in draft(s).')->assertSuccessful();

    expect(AuditLog::where('action', 'walk_in_drafts.pruned')->count())->toBe(0);
});

test('the job is scheduled daily', function () {
    $this->artisan('schedule:list')->expectsOutputToContain('bookings:prune-walk-in-drafts');
});
