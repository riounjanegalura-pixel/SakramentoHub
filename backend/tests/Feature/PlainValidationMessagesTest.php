<?php

use App\Models\User;
use Illuminate\Http\Testing\File;
use Illuminate\Support\Facades\Storage;

beforeEach(function () {
    Storage::fake('local');
    $this->seed(\Database\Seeders\ServiceSeeder::class);
    $this->seed(\Database\Seeders\ParishSettingSeeder::class);
});

test('a wrong file type gets a plain message', function () {
    $this->actingAs(User::factory()->create())->postJson('/api/documents', ['file' => File::create('notes.txt', 10)])
        ->assertUnprocessable()->assertJsonPath('errors.file.0', 'Upload a JPG, PNG or PDF file.');
});

test('a file over 5 MB gets a plain message', function () {
    $this->actingAs(User::factory()->create())->postJson('/api/documents', ['file' => File::create('big.pdf', 6144)])
        ->assertUnprocessable()->assertJsonPath('errors.file.0', 'The file is larger than 5 MB. Upload a smaller file.');
});

test('no file gets a plain message', function () {
    $this->actingAs(User::factory()->create())->postJson('/api/documents', [])
        ->assertUnprocessable()->assertJsonPath('errors.file.0', 'Choose a file to upload.');
});

test('a session time that is not HH:MM gets a plain message', function () {
    $admin = User::factory()->create(['role' => 'admin']);

    $this->actingAs($admin)->patchJson('/api/admin/settings/services/baptism', ['sessionTimes' => ['9am']])
        ->assertUnprocessable()->assertJsonValidationErrors(['sessionTimes.0' => 'Enter session times as HH:MM, for example 09:30.']);
});
