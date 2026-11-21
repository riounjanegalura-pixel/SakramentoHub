<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // The ledger that makes a reminder go out once: the unique key is the send-once rule.
        // The subject says what the reminder was about (a date, a step), so a moved booking is reminded again.
        Schema::create('sent_reminders', function (Blueprint $table) {
            $table->foreignUuid('booking_id')->constrained('bookings')->cascadeOnDelete();
            $table->string('kind', 40);
            $table->string('subject', 60);
            $table->timestamp('sent_at');
            $table->unique(['booking_id', 'kind', 'subject']);
        });
    }
};
