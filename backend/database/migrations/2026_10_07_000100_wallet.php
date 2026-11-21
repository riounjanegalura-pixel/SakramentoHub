<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('wallet_documents', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('kind', 30);
            $table->string('person_name', 120);
            $table->string('file_url', 255);
            $table->string('original_name', 255);
            $table->string('mime', 100);
            $table->unsignedInteger('size_bytes');
            $table->timestamps();
            $table->index('user_id');
        });
    }
};
