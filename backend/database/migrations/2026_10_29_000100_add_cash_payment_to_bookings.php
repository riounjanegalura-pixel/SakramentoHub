<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Cash at the parish office alongside GCash. The old
 * `payment_method` column was dropped by the 2026-10-03 lifecycle restructure,
 * so it comes back here: 'gcash' or 'cash', null until a method is known.
 * Written only by BookingStateMachine (chooseCash, markCashReceived, recordPayment).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->string('payment_method', 16)->nullable();
            // The office's own receipt number for cash taken at the counter; optional.
            $table->string('cash_receipt_reference', 120)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->dropColumn(['payment_method', 'cash_receipt_reference']);
        });
    }
};
