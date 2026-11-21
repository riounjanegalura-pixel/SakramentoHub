<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->date('birth_date')->nullable();
            $table->string('sex', 10)->nullable();
            $table->string('civil_status', 20)->nullable();
            $table->string('address_line')->nullable();
            $table->json('address_psgc')->nullable();
            $table->string('home_parish')->default('St. Peter the Apostle Parish, Balagtas');
        });
    }

    public function down(): void
    {
        Schema::table('users', fn (Blueprint $table) => $table->dropColumn([
            'birth_date', 'sex', 'civil_status', 'address_line', 'address_psgc', 'home_parish',
        ]));
    }
};
