<?php

use App\Models\Booking;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * Backfill-safe: nullable + unique from the start (both MySQL and SQLite
     * treat multiple NULLs as distinct under a unique constraint, so adding
     * the constraint before backfilling never conflicts), then every
     * pre-existing row is given a real reference number using the exact same
     * generator `Booking::booted()`'s `creating` hook uses for every row
     * created from this point on — no row is ever left with a fabricated or
     * placeholder value.
     */
    public function up(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->string('reference_number')->nullable()->unique()->after('sacrament');
        });

        DB::table('bookings')->orderBy('created_at')->get(['id', 'sacrament', 'created_at'])
            ->each(function ($booking) {
                DB::table('bookings')->where('id', $booking->id)->update([
                    'reference_number' => Booking::generateReferenceNumber($booking->sacrament, $booking->created_at),
                ]);
            });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->dropColumn('reference_number');
        });
    }
};
