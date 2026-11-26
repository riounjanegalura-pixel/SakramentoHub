<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A closure may cover part of a day. Both times null = the whole day (every closure made so far);
 * both set = only that window is closed, the rest of the day stays bookable.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('blackout_dates', function (Blueprint $table) {
            $table->string('start_time', 5)->nullable()->after('reason');
            $table->string('end_time', 5)->nullable()->after('start_time');
        });
    }

    public function down(): void
    {
        Schema::table('blackout_dates', fn (Blueprint $table) => $table->dropColumn(['start_time', 'end_time']));
    }
};
