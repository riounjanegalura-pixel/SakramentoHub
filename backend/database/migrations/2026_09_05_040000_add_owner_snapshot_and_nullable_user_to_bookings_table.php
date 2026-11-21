<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Backs the new self-service account-deletion right (item 11's remainder).
 * bookings.user_id was cascadeOnDelete — deleting a user's account would have
 * silently destroyed their entire booking history, which the parish needs to
 * keep for its own sacramental recordkeeping even after the account itself is
 * gone. Same philosophy as the 2026_09_04_220000 audit-log fix: go
 * nullOnDelete (requires the column nullable, hence drop+re-add), and
 * denormalize what the UI/certificates need to keep displaying a booking
 * sensibly into a new `owner_snapshot` json column, written once at deletion
 * time (see AccountController::destroy).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->json('owner_snapshot')->nullable()->after('user_id');
        });

        Schema::table('bookings', function (Blueprint $table) {
            $table->dropForeign(['user_id']);
        });

        Schema::table('bookings', function (Blueprint $table) {
            $table->uuid('user_id')->nullable()->change();
        });

        Schema::table('bookings', function (Blueprint $table) {
            $table->foreign('user_id')->references('id')->on('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->dropForeign(['user_id']);
        });

        Schema::table('bookings', function (Blueprint $table) {
            $table->uuid('user_id')->nullable(false)->change();
        });

        Schema::table('bookings', function (Blueprint $table) {
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
        });

        Schema::table('bookings', function (Blueprint $table) {
            $table->dropColumn('owner_snapshot');
        });
    }
};
