<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('services', function (Blueprint $table) {
            $table->string('fee_rule')->default('flat');
            $table->unsignedSmallInteger('duration_minutes')->default(60);
            $table->boolean('offsite')->default(false);
            $table->json('allowed_weekdays')->nullable();
            $table->unsignedSmallInteger('lead_time_days')->default(0);
            $table->unsignedSmallInteger('daily_capacity')->nullable();
            $table->json('session_weekdays')->nullable();
            $table->json('session_times')->nullable();
            $table->unsignedSmallInteger('session_capacity')->nullable();
            $table->unsignedSmallInteger('session_duration_minutes')->nullable();
        });

        foreach (\Database\Seeders\ServiceSchedulingDefaults::BY_SERVICE as $id => $values) {
            DB::table('services')->where('id', $id)->update(array_map(
                fn ($v) => is_array($v) ? json_encode($v) : $v,
                $values,
            ));
        }
    }

    public function down(): void
    {
        Schema::table('services', function (Blueprint $table) {
            $table->dropColumn([
                'fee_rule', 'duration_minutes', 'offsite', 'allowed_weekdays', 'lead_time_days',
                'daily_capacity', 'session_weekdays', 'session_times', 'session_capacity', 'session_duration_minutes',
            ]);
        });
    }
};
