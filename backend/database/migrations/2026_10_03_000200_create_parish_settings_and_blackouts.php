<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('parish_settings', function (Blueprint $table) {
            $table->string('key')->primary();
            $table->json('value');
            $table->timestamps();
        });

        Schema::create('blackout_dates', function (Blueprint $table) {
            $table->id();
            $table->date('date')->index();
            $table->string('reason');
            $table->json('sacraments')->nullable(); // null = applies to every sacrament
            $table->timestamps();
        });

        Schema::table('parish_events', function (Blueprint $table) {
            $table->unsignedSmallInteger('duration_minutes')->default(60);
        });
    }

    public function down(): void
    {
        Schema::table('parish_events', fn (Blueprint $table) => $table->dropColumn('duration_minutes'));
        Schema::dropIfExists('blackout_dates');
        Schema::dropIfExists('parish_settings');
    }
};
