<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('certificate_requests', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('reference_number', 30)->unique();
            // Null once the account is deleted; owner_snapshot keeps who asked.
            $table->foreignUuid('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->json('owner_snapshot')->nullable();
            $table->string('sacrament', 30);
            $table->string('person_name', 160);
            $table->string('sacrament_date_text', 60);
            $table->json('details')->nullable();
            $table->string('relationship', 20);
            $table->string('purpose', 200);
            // Nulled by the 30-day clean-up once the request has closed.
            $table->string('id_url', 255)->nullable();
            $table->string('letter_url', 255)->nullable();
            $table->string('status', 20)->default('submitted');
            $table->string('decline_reason', 500)->nullable();
            $table->foreignUuid('register_entry_id')->nullable()->constrained('register_entries')->nullOnDelete();
            $table->foreignUuid('handled_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('closed_at')->nullable();
            $table->timestamp('files_removed_at')->nullable();
            $table->timestamps();
            $table->index('status');
        });
    }
};
