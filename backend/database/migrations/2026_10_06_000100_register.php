<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('register_sequences', function (Blueprint $table) {
            $table->id();
            $table->string('sacrament', 30);
            $table->unsignedSmallInteger('year');
            $table->unsignedInteger('last_number')->default(0);
            $table->unique(['sacrament', 'year']);
        });

        Schema::create('register_entries', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('sacrament', 30);
            $table->unsignedSmallInteger('year');
            $table->unsignedInteger('sequence');
            $table->string('register_number', 30)->unique();
            $table->string('verify_code', 12)->nullable();
            $table->foreignUuid('booking_id')->nullable()->unique()->constrained('bookings')->nullOnDelete();
            $table->string('source', 12)->default('system');
            $table->string('subject_name', 160);
            $table->date('ceremony_date');
            $table->string('book_no', 20)->nullable();
            $table->string('page_no', 20)->nullable();
            $table->string('line_no', 20)->nullable();
            $table->json('snapshot');
            $table->string('status', 10)->default('valid');
            $table->text('revoked_reason')->nullable();
            $table->foreignUuid('revoked_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('revoked_at')->nullable();
            $table->timestamp('corrected_at')->nullable();
            $table->foreignUuid('entered_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->unique(['sacrament', 'year', 'sequence']);
            $table->unique(['sacrament', 'book_no', 'page_no', 'line_no']);
            $table->index('ceremony_date');
        });
    }
};
