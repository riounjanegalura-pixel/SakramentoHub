<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Mirrors the built-in `password_reset_tokens` table shape exactly (email
     * primary key, hashed token, created_at for expiry) — there's no signed
     * named route to hang email verification off in an API-only backend, so
     * this is the same real, tamper-resistant mechanism Laravel's own
     * password broker uses, just for a different purpose.
     */
    public function up(): void
    {
        Schema::create('email_verification_tokens', function (Blueprint $table) {
            $table->string('email')->primary();
            $table->string('token');
            $table->timestamp('created_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('email_verification_tokens');
    }
};
