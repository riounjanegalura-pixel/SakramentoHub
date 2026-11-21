<?php

namespace App\Console\Commands;

use App\Models\CertificateRequest;
use App\Services\AuditTrail;
use App\Support\StoredDocuments;
use Illuminate\Console\Command;
use Illuminate\Support\Str;

/** The ID and authorisation letter on a request are kept only while the office needs them: 30 days after it closes. */
class PruneCertificateRequestFiles extends Command
{
    protected $signature = 'certificate-requests:prune-files';

    protected $description = 'Delete the ID and letter files of certificate requests closed more than 30 days ago';

    public function handle(AuditTrail $audit): int
    {
        $requests = CertificateRequest::whereNotNull('closed_at')->where('closed_at', '<', now()->subDays(30))
            ->whereNull('files_removed_at')->where(fn ($q) => $q->whereNotNull('id_url')->orWhereNotNull('letter_url'))->get();

        foreach ($requests as $request) {
            $files = array_filter([$request->id_url, $request->letter_url]);
            // Clear the row first, so the request itself no longer counts as using the file.
            $request->update(['id_url' => null, 'letter_url' => null, 'files_removed_at' => now()]);
            foreach (array_unique($files) as $file) {
                StoredDocuments::deleteIfUnreferenced($file);
            }
        }

        if ($requests->isNotEmpty()) {
            $audit->record(null, 'certificate_requests.files_pruned', 'certificate_request', (string) Str::uuid(), ['count' => $requests->count()]);
        }
        $this->info("Cleared the files of {$requests->count()} certificate request(s).");

        return self::SUCCESS;
    }
}
