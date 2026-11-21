<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            // Plain string, not a DB enum: matches the existing `status` column's
            // convention on bookings (validated in the application layer via
            // Rule::in(), no DB-level constraint) rather than introducing a new
            // pattern for this one column.
            $table->string('role')->default('parishioner')->after('address');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('role');
        });
    }
};
