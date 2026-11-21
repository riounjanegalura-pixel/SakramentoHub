<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Backs the admin "deactivate" action (item 21) — chosen over hard
     * deletion because a deleted user with historical bookings/audit-log
     * rows would orphan or destroy real records (the audit log was just
     * fixed to survive a deleted actor; deleting users again would
     * reintroduce that exact problem). Defaults to true so every existing
     * row (and every new self-registered parishioner) is active with no
     * backfill needed.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->boolean('is_active')->default(true)->after('role');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('is_active');
        });
    }
};
