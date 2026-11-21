<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('donations', function (Blueprint $table) {
            $table->uuid('id')->primary();
            // A donor does not need an account; when signed in, the donation is linked to it.
            $table->foreignUuid('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->unsignedInteger('amount_centavos');
            $table->string('status', 20)->default('pending')->index();
            $table->string('paymongo_checkout_session_id')->nullable()->unique();
            $table->string('paymongo_payment_id')->nullable();
            $table->timestamp('paid_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('donations');
    }
};
