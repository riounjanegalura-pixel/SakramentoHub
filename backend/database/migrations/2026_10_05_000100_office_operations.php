<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->string('channel', 20)->default('online')->index();
            $table->uuid('created_by')->nullable();
            $table->foreign('created_by')->references('id')->on('users')->nullOnDelete();
            $table->unsignedInteger('amount_paid_centavos')->nullable();
            $table->unsignedInteger('amount_refunded_centavos')->default(0);
        });

        Schema::create('booking_document_reviews', function (Blueprint $table) {
            $table->id();
            $table->foreignUuid('booking_id')->constrained('bookings')->cascadeOnDelete();
            $table->string('document_key', 60);
            $table->string('file_url', 255);
            $table->string('status', 10);
            $table->text('note')->nullable();
            $table->foreignUuid('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->unique(['booking_id', 'document_key']);
        });

        Schema::create('booking_notes', function (Blueprint $table) {
            $table->id();
            $table->foreignUuid('booking_id')->constrained('bookings')->cascadeOnDelete();
            $table->foreignUuid('author_id')->nullable()->constrained('users')->nullOnDelete();
            $table->text('body');
            $table->timestamp('created_at')->nullable();
        });

        $this->backfill();
    }

    /** What PayMongo received equals what was due for every payment made before this column existed. */
    public function backfill(): void
    {
        DB::table('bookings')
            ->whereIn('payment_status', ['paid', 'refund_due', 'refunded'])
            ->whereNull('amount_paid_centavos')
            ->update(['amount_paid_centavos' => DB::raw('amount_due_centavos')]);
    }

    public function down(): void
    {
        Schema::dropIfExists('booking_notes');
        Schema::dropIfExists('booking_document_reviews');
        Schema::table('bookings', function (Blueprint $table) {
            $table->dropConstrainedForeignId('created_by');
            $table->dropIndex(['channel']);
            $table->dropColumn(['channel', 'amount_paid_centavos', 'amount_refunded_centavos']);
        });
    }
};
