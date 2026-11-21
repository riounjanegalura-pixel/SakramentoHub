<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            // Day-of arrival: written only by BookingStateMachine::checkIn, and it never changes the status.
            $table->timestamp('checked_in_at')->nullable();
            $table->uuid('checked_in_by')->nullable();
            $table->foreign('checked_in_by')->references('id')->on('users')->nullOnDelete();
        });
    }
};
