<?php

namespace App\Console\Commands;

use App\Models\User;
use App\Support\StoredDocuments;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;

/**
 * A file a staff member uploaded for a walk-in whose attach then failed is not referenced by anything.
 * Seven days is long enough to attach it the next working day; after that, an unreferenced file is removed.
 * StoredDocuments refuses to delete anything a booking, review, wallet row or certificate request still uses.
 */
class PruneStaffUploads extends Command
{
    protected $signature = 'documents:prune-staff-uploads';

    protected $description = 'Delete staff and admin uploads older than 7 days that no booking or certificate request uses';

    public function handle(): int
    {
        $disk = Storage::disk('local');
        $cutoff = now()->subDays(7)->getTimestamp();
        $deleted = 0;

        $staffIds = User::whereIn('role', config('roles.staff_side'))->pluck('id');
        foreach ($staffIds as $id) {
            foreach ($disk->files("documents/{$id}") as $path) {
                if ($disk->lastModified($path) >= $cutoff) {
                    continue;
                }
                if (StoredDocuments::deleteIfUnreferenced('/'.$path)) {
                    $deleted++;
                }
            }
        }

        $this->info("Deleted {$deleted} unattached staff upload(s).");

        return self::SUCCESS;
    }
}
