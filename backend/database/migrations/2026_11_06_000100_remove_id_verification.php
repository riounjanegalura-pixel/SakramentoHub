<?php

use App\Models\WalletDocument;
use App\Support\StoredDocuments;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

/**
 * ID checks are retired (owner decision, 2026-11-06). Drops the check records and deletes every stored
 * government ID photo, so the parish no longer holds the most sensitive images in the system.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::dropIfExists('id_verifications');

        WalletDocument::where('kind', 'government_id')->get()->each(function (WalletDocument $doc) {
            $doc->delete();
            StoredDocuments::deleteIfUnreferenced($doc->file_url);
        });
    }

    public function down(): void
    {
        // Not reversible: the ID photos are deleted for good.
    }
};
