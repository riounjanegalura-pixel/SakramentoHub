<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * The parish's papers ask for a wedding to be booked at least 2 days before the date, not 90.
 * Only the old default is changed; a lead time the parish already set by hand is left alone.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('services')->where('id', 'wedding')->where('lead_time_days', 90)->update(['lead_time_days' => 2]);
    }

    public function down(): void
    {
        DB::table('services')->where('id', 'wedding')->where('lead_time_days', 2)->update(['lead_time_days' => 90]);
    }
};
