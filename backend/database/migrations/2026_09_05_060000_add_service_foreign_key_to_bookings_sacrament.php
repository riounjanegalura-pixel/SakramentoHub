<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * `bookings.sacrament` and `services.id` have always shared the exact same
 * value space (`'baptism'`, `'wedding'`, `'confirmation'`, `'funeral'`,
 * `'anointing'`, `'house-blessing'`) but there was never a real database-level
 * foreign key tying them together — just a hardcoded `Rule::in()` array in
 * `CreateBookingRequest` that happened to duplicate the same six values as
 * `ServiceSeeder`. Two independent hardcoded copies of the same list could
 * silently drift out of sync; a real FK makes `services` the one source of
 * truth.
 *
 * Safe to add directly, unlike the `bookings.user_id` /
 * `audit_logs.actor_user_id` precedents (2026_09_04_220000,
 * 2026_09_05_040000) — those needed a drop-nullable-re-add dance because they
 * were adding nullOnDelete to a column that had to become nullable first.
 * `sacrament` is already `NOT NULL` and every existing/future value is
 * already constrained to exactly the six real `services.id` rows by
 * `CreateBookingRequest`'s validation (upgraded in this same change from
 * `Rule::in()` to `Rule::exists('services', 'id')`), so there is no invalid
 * data that could violate the constraint — no `nullable()->change()` step is
 * needed at all.
 *
 * `onDelete` deliberately left unspecified, i.e. plain `.constrained()`,
 * which defaults to RESTRICT: `services` has no delete endpoint anywhere in
 * this app (grepped `Service::` for `delete`/`destroy` calls — none exist)
 * and is pure seeded reference data that both the parishioner and admin apps
 * assume is always fully present (6 rows, always). Unlike `users` or
 * `parish_events.created_by`, there is no real-world scenario where a
 * `services` row should ever go away while bookings reference it, so this
 * intentionally does NOT match the cascadeOnDelete/nullOnDelete pattern of
 * the two migrations above — RESTRICT (a service can't be deleted while any
 * booking references it) is the correct default here, not a fallback chosen
 * for lack of a better option.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->foreign('sacrament')->references('id')->on('services');
        });
    }

    public function down(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->dropForeign(['sacrament']);
        });
    }
};
