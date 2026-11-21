<?php

use App\Models\User;
use Illuminate\Http\Testing\File;
use Illuminate\Support\Facades\Storage;

test('uploads a document and returns an authenticated download url scoped to the uploader', function () {
    Storage::fake('local');
    $user = User::factory()->create();

    $response = $this->actingAs($user)->postJson('/api/documents', [
        'file' => File::create('baptismal-certificate.jpg', 100),
    ]);

    $response->assertOk()->assertJsonStructure(['url']);
    expect($response->json('url'))->toStartWith("/documents/{$user->id}/");
    // Never a directly-browsable public storage URL.
    expect($response->json('url'))->not->toContain('/storage/');
});

test('rejects an unauthenticated document upload', function () {
    $response = $this->postJson('/api/documents', [
        'file' => File::create('doc.jpg', 100),
    ]);

    $response->assertUnauthorized();
});

test('rejects an oversized document upload', function () {
    Storage::fake('local');
    $user = User::factory()->create();

    $response = $this->actingAs($user)->postJson('/api/documents', [
        'file' => File::create('too-big.jpg', 6000), // > 5120 KB limit
    ]);

    $response->assertUnprocessable();
});

test('rejects a document upload with a disallowed file type', function () {
    Storage::fake('local');
    $user = User::factory()->create();

    $response = $this->actingAs($user)->postJson('/api/documents', [
        'file' => File::create('script.exe', 100),
    ]);

    $response->assertUnprocessable();
});

test('a PDF is served inline with its real content type', function () {
    Storage::fake('local');
    $user = User::factory()->create();
    $upload = $this->actingAs($user)->postJson('/api/documents', [
        'file' => File::create('cert.pdf', 100, 'application/pdf'),
    ]);

    $response = $this->actingAs($user)->get('/api'.$upload->json('url'))->assertOk();
    expect($response->headers->get('Content-Type'))->toContain('application/pdf');
    expect($response->headers->get('Content-Disposition'))->toStartWith('inline');
});

test('the uploader can download their own document', function () {
    Storage::fake('local');
    $user = User::factory()->create();
    $upload = $this->actingAs($user)->postJson('/api/documents', [
        'file' => File::create('cert.jpg', 100),
    ]);

    $this->actingAs($user)->get('/api'.$upload->json('url'))->assertOk();
});

test('staff can download another user\'s document', function () {
    Storage::fake('local');
    $user = User::factory()->create();
    $staff = User::factory()->create(['role' => 'staff']);
    $upload = $this->actingAs($user)->postJson('/api/documents', [
        'file' => File::create('cert.jpg', 100),
    ]);

    $this->actingAs($staff)->get('/api'.$upload->json('url'))->assertOk();
});

test('another parishioner cannot download someone else\'s document', function () {
    Storage::fake('local');
    $owner = User::factory()->create();
    $intruder = User::factory()->create();
    $upload = $this->actingAs($owner)->postJson('/api/documents', [
        'file' => File::create('cert.jpg', 100),
    ]);

    $this->actingAs($intruder)->get('/api'.$upload->json('url'))->assertForbidden();
});

test('downloading a nonexistent document 404s', function () {
    Storage::fake('local');
    $user = User::factory()->create();

    $this->actingAs($user)->get("/api/documents/{$user->id}/does-not-exist.jpg")->assertNotFound();
});
