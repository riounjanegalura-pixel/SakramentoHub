<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Replaces the manual "upload a GCash screenshot, staff eyeball it" flow
     * with gateway-verified payment state (PayMongo checkout + webhook).
     *
     * - payment_status: null for every pre-existing row (legacy: those were
     *   either receipt-verified by staff or donation-based — we can't
     *   retroactively know which, so we don't pretend to). New submissions
     *   always get 'not_required' (₱0 / donation-based) or 'pending', and the
     *   signed webhook is the only thing that ever writes 'paid'.
     * - amount_due_centavos: snapshotted server-side at submit time, so a
     *   later price change in `services` can't alter what an in-flight
     *   booking owes, and the client-side fee calculation is never trusted.
     * - paymongo_checkout_session_id / paymongo_payment_id: the gateway's own
     *   ids, for reconciling against the PayMongo dashboard (and refunds).
     * - paid_at: when the webhook confirmed the payment.
     *
     * `receipt_url` is deliberately kept: older bookings still carry a
     * staff-reviewed receipt that the admin detail screen shows read-only.
     */
    public function up(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->string('payment_status')->nullable()->after('payment_method');
            $table->unsignedInteger('amount_due_centavos')->nullable()->after('payment_status');
            $table->string('paymongo_checkout_session_id')->nullable()->index()->after('amount_due_centavos');
            $table->string('paymongo_payment_id')->nullable()->after('paymongo_checkout_session_id');
            $table->timestamp('paid_at')->nullable()->after('paymongo_payment_id');
        });
    }

    public function down(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->dropIndex(['paymongo_checkout_session_id']);
            $table->dropColumn([
                'payment_status',
                'amount_due_centavos',
                'paymongo_checkout_session_id',
                'paymongo_payment_id',
                'paid_at',
            ]);
        });
    }
};
