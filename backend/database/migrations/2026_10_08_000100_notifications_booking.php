<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('notifications', function (Blueprint $table) {
            // The booking a notification is about, so the app (and the email) can open it. Null for anything else.
            $table->uuid('booking_id')->nullable();
            $table->foreign('booking_id')->references('id')->on('bookings')->nullOnDelete();
        });
    }
};
