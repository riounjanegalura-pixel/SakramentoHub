<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Closes a real hole in the "immutable audit log" claim: actor_user_id was
 * cascadeOnDelete, so deleting a user would silently delete every audit row
 * they ever created — the opposite of an audit trail. Not remotely
 * exploitable today (no user-delete endpoint exists anywhere in the app),
 * but the schema itself shouldn't make the log destructible, and a reader
 * of the migrations would spot it immediately.
 *
 * nullOnDelete requires the column to be nullable, hence dropping and
 * re-adding it. The actor's name/email is denormalized into `metadata` at
 * write time (see Admin\BookingController::logAction) so a log entry stays
 * meaningful even after the actor_user_id goes null.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('audit_logs', function (Blueprint $table) {
            $table->dropForeign(['actor_user_id']);
        });

        Schema::table('audit_logs', function (Blueprint $table) {
            $table->uuid('actor_user_id')->nullable()->change();
        });

        Schema::table('audit_logs', function (Blueprint $table) {
            $table->foreign('actor_user_id')->references('id')->on('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('audit_logs', function (Blueprint $table) {
            $table->dropForeign(['actor_user_id']);
        });

        Schema::table('audit_logs', function (Blueprint $table) {
            $table->uuid('actor_user_id')->nullable(false)->change();
        });

        Schema::table('audit_logs', function (Blueprint $table) {
            $table->foreign('actor_user_id')->references('id')->on('users')->cascadeOnDelete();
        });
    }
};
