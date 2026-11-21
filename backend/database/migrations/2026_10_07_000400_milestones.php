<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Only the wedding preparation steps staff tick by hand live here; every other step is computed (WeddingMilestones).
        Schema::create('booking_milestones', function (Blueprint $table) {
            $table->id();
            $table->foreignUuid('booking_id')->constrained('bookings')->cascadeOnDelete();
            $table->string('key', 40);
            $table->timestamp('done_at');
            $table->foreignUuid('done_by')->nullable()->constrained('users')->nullOnDelete();
            $table->text('note')->nullable();
            // The marriage license details (number, date and place of issue), or { art34: true }.
            $table->json('data')->nullable();
            $table->timestamps();
            $table->unique(['booking_id', 'key']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('booking_milestones');
    }
};
