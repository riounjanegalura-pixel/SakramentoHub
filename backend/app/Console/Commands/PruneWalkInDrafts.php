<?php

namespace App\Console\Commands;

use App\Models\Booking;
use App\Services\AuditTrail;
use App\Support\StoredDocuments;
use Illuminate\Console\Command;
use Illuminate\Support\Str;

/**
 * A counter walk-in the office started and never finished leaves a draft and its uploaded files behind.
 * Online drafts are the parishioner's own and are never touched.
 */
class PruneWalkInDrafts extends Command
{
    protected $signature = 'bookings:prune-walk-in-drafts';

    protected $description = 'Delete walk-in drafts untouched for 24 hours, and their files when nothing else uses them';

    public function handle(AuditTrail $audit): int
    {
        $drafts = Booking::where('status', 'draft')->where('channel', 'walk_in')->where('updated_at', '<', now()->subHours(24))->get();

        $deleted = 0;
        foreach ($drafts as $draft) {
            $files = [];
            $data = (array) $draft->form_data;
            array_walk_recursive($data, function ($value) use (&$files) {
                if (is_string($value) && str_starts_with($value, '/documents/')) {
                    $files[] = $value;
                }
            });

            $draft->delete();
            $deleted++;
            // After the row is gone, so the draft itself no longer counts as a reference.
            foreach (array_unique($files) as $file) {
                StoredDocuments::deleteIfUnreferenced($file);
            }
        }

        if ($deleted > 0) {
            $audit->record(null, 'walk_in_drafts.pruned', 'walk_in_draft', (string) Str::uuid(), ['count' => $deleted]);
        }
        $this->info("Deleted {$deleted} walk-in draft(s).");

        return self::SUCCESS;
    }
}
