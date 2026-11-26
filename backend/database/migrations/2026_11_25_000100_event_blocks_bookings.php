<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * A parish event can close its time on the sacrament calendar. Until now only Masses did (through their category); the
 * office wants any event to be able to. New events block by default. Events that already exist keep behaving as they did:
 * Masses block, everything else does not, so an old feast-day notice never silently closes a morning.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('parish_events', function (Blueprint $table) {
            $table->boolean('blocks_bookings')->default(true)->after('duration_minutes');
        });

        DB::table('parish_events')->where('category', '!=', 'mass')->update(['blocks_bookings' => false]);
    }

    public function down(): void
    {
        Schema::table('parish_events', function (Blueprint $table) {
            $table->dropColumn('blocks_bookings');
        });
    }
};
