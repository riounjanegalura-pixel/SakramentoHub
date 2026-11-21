<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Backs the new staff/admin parish-events management feature — before this,
 * `parish_events` had zero create/update/delete path at all, only a seeder.
 *
 * `created_by` is added nullable + nullOnDelete from the start, in one step
 * — unlike the audit_logs (2026_09_04_220000) and bookings (2026_09_05_040000)
 * precedents, which had to drop-and-re-add an *existing* NOT NULL column to
 * relax it, this is a brand-new column on an existing table, so it can just
 * be declared nullable()->nullOnDelete() directly with no separate
 * alter-then-constrain step needed.
 *
 * No denormalized "creator snapshot" column, deliberately — see
 * ParishEvent::creatorName()'s doc comment for the reasoning: unlike a
 * booking's owner or an audit-log's actor, a parish event's own title/date/
 * location/category remain fully meaningful with no reference to who
 * created it, so there is nothing worth preserving once the creator account
 * is gone beyond "this event now has no known creator" (created_by => null).
 *
 * Also relaxes `image_url` to nullable: the original migration made it
 * NOT NULL, but this feature's own validation (CreateParishEventRequest)
 * correctly treats it as optional — an announcement with no photo is a real
 * case (EventCard.tsx doesn't actually render the image today anyway), and
 * the DB constraint should match what's actually enforced at the app layer
 * instead of silently 500ing on a legitimate imageUrl-less create/update.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('parish_events', function (Blueprint $table) {
            $table->uuid('created_by')->nullable()->after('category');
            $table->foreign('created_by')->references('id')->on('users')->nullOnDelete();
        });

        Schema::table('parish_events', function (Blueprint $table) {
            $table->string('image_url')->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('parish_events', function (Blueprint $table) {
            $table->string('image_url')->nullable(false)->change();
        });

        Schema::table('parish_events', function (Blueprint $table) {
            $table->dropForeign(['created_by']);
            $table->dropColumn('created_by');
        });
    }
};
