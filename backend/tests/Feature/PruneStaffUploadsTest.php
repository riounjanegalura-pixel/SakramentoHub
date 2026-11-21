<?php

use App\Models\Booking;
use App\Models\CertificateRequest;
use App\Models\User;
use Illuminate\Support\Facades\Storage;

beforeEach(function () {
    Storage::fake('local');
    $this->seed(\Database\Seeders\ServiceSeeder::class);
    $this->staff = User::factory()->create(['role' => 'staff']);
    $this->parishioner = User::factory()->create(['role' => 'parishioner']);
});

function uploadAged(User $user, string $name, int $daysOld): string
{
    $path = "documents/{$user->id}/{$name}";
    Storage::disk('local')->put($path, 'x');
    touch(Storage::disk('local')->path($path), now()->subDays($daysOld)->getTimestamp());

    return "/documents/{$user->id}/{$name}";
}

test('an old unattached staff upload is deleted and the count is printed', function () {
    uploadAged($this->staff, 'orphan.jpg', 8);

    $this->artisan('documents:prune-staff-uploads')->expectsOutput('Deleted 1 unattached staff upload(s).')->assertSuccessful();

    Storage::disk('local')->assertMissing("documents/{$this->staff->id}/orphan.jpg");
});

test('a staff upload used by a booking of any status is kept', function () {
    foreach (['draft', 'cancelled', 'approved'] as $i => $status) {
        $url = uploadAged($this->staff, "used{$i}.jpg", 20);
        Booking::factory()->create(['user_id' => $this->parishioner->id, 'status' => $status, 'form_data' => ['birthCertificate' => $url]]);
    }

    $this->artisan('documents:prune-staff-uploads')->assertSuccessful();

    foreach ([0, 1, 2] as $i) {
        Storage::disk('local')->assertExists("documents/{$this->staff->id}/used{$i}.jpg");
    }
});

test('a staff upload used by a certificate request is kept', function () {
    $url = uploadAged($this->staff, 'cert.jpg', 20);
    CertificateRequest::factory()->create(['user_id' => $this->parishioner->id, 'id_url' => $url]);

    $this->artisan('documents:prune-staff-uploads')->assertSuccessful();

    Storage::disk('local')->assertExists("documents/{$this->staff->id}/cert.jpg");
});

test('a recent staff upload is kept', function () {
    uploadAged($this->staff, 'new.jpg', 2);

    $this->artisan('documents:prune-staff-uploads')->assertSuccessful();

    Storage::disk('local')->assertExists("documents/{$this->staff->id}/new.jpg");
});

test('a parishioner upload is never swept', function () {
    uploadAged($this->parishioner, 'mine.jpg', 30);

    $this->artisan('documents:prune-staff-uploads')->assertSuccessful();

    Storage::disk('local')->assertExists("documents/{$this->parishioner->id}/mine.jpg");
});
