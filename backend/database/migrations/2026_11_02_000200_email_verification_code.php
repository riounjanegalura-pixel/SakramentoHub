<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A 6-digit code beside the emailed link. The link goes through the mail service's click tracker, which some
 * browsers block or slow down; the code is typed on the "Check your email" screen and needs no link at all.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('email_verification_tokens', function (Blueprint $table) {
            $table->string('code')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('email_verification_tokens', function (Blueprint $table) {
            $table->dropColumn('code');
        });
    }
};
