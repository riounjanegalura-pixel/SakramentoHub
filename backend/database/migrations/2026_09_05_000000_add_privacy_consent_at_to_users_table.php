<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Backs the actual, demonstrable answer to the paper's NFR:001 (RA 10173
 * Data Privacy Act compliance) claim, which previously had zero code behind
 * it — no consent capture anywhere, at registration or otherwise. This
 * records exactly when a user consented, not just a boolean — a real,
 * timestamped audit trail a panel can be shown, not just told about.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->timestamp('privacy_consent_at')->nullable()->after('role');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('privacy_consent_at');
        });
    }
};
