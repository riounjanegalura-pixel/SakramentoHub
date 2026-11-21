<?php

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

uses(TestCase::class, RefreshDatabase::class)->in('Feature');

expect()->extend('toBeOne', function () {
    return $this->toBe(1);
});

function something()
{
    // ..
}

/**
 * Loads a shared validation fixture from the repo-root contracts/ folder,
 * binds its document paths to $ownerId and creates those files on the
 * (already faked) local disk so OwnedDocument passes.
 */
function formDataFixture(string $name, string $ownerId): array
{
    $json = file_get_contents(base_path("../contracts/fixtures/{$name}.json"));
    $data = json_decode(\App\Support\FixtureDates::expand(str_replace('{OWNER}', $ownerId, $json)), true);

    array_walk_recursive($data['formData'], function ($value) {
        if (is_string($value) && str_starts_with($value, '/documents/')) {
            \Illuminate\Support\Facades\Storage::disk('local')->put(ltrim($value, '/'), 'test');
        }
    });

    return $data['formData'];
}

/** Marks every uploaded document on the booking as accepted, as staff would before approving (rule T8). */
function acceptAllDocuments(\App\Models\Booking $booking): void
{
    foreach ($booking->fresh()->documentChecklist() as $doc) {
        if ($doc['url'] !== null) {
            \App\Models\BookingDocumentReview::updateOrCreate(
                ['booking_id' => $booking->id, 'document_key' => $doc['key']],
                ['file_url' => $doc['url'], 'status' => 'accepted', 'note' => null, 'reviewed_by' => null],
            );
        }
    }
}

/**
 * Everything a wedding needs before it can be marked completed: its documents accepted and the gating
 * preparation steps ticked, as the office would have done over the months before the day.
 */
function completeWeddingPreparation(\App\Models\Booking $booking): void
{
    acceptAllDocuments($booking);

    foreach (app(\App\Services\Booking\WeddingMilestones::class)->for($booking->fresh()) as $step) {
        if ($step['gating'] && $step['manual'] && ! $step['done']) {
            \App\Models\BookingMilestone::updateOrCreate(
                ['booking_id' => $booking->id, 'key' => $step['key']],
                ['done_at' => now(), 'done_by' => null, 'note' => 'Done', 'data' => $step['key'] === 'marriage_license' ? ['art34' => true] : null],
            );
        }
    }
}
