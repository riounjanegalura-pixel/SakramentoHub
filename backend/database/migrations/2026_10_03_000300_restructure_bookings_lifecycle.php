<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->date('appointment_date')->nullable()->index();
            $table->string('appointment_start', 5)->nullable();
            $table->string('appointment_end', 5)->nullable();
            $table->boolean('is_offsite')->default(false);
            $table->boolean('is_emergency')->default(false);
            $table->timestamp('payment_hold_expires_at')->nullable();
            $table->timestamp('returned_at')->nullable();
            $table->text('status_reason')->nullable();
            $table->text('return_note')->nullable();
            $table->string('refund_reference')->nullable();
            $table->timestamp('refunded_at')->nullable();
        });

        $durations = DB::table('services')->pluck('duration_minutes', 'id');

        DB::table('bookings')->orderBy('id')->each(function ($row) use ($durations) {
            $form = json_decode($row->form_data ?? '{}', true) ?: [];
            $date = self::normalizeDate($form['appointmentDate'] ?? null);
            $start = self::normalizeTime($form['appointmentTime'] ?? null);
            unset($form['appointmentDate'], $form['appointmentTime']);

            $end = null;
            if ($start !== null) {
                $end = Carbon::createFromFormat('H:i', $start)
                    ->addMinutes((int) ($durations[$row->sacrament] ?? 60))
                    ->format('H:i');
            }

            $status = $row->status === 'rejected' ? 'declined' : $row->status;

            $payment = match (true) {
                $row->payment_status === 'pending' => 'unpaid',
                $row->payment_status !== null => $row->payment_status,
                in_array($status, ['submitted', 'approved', 'completed'], true) => 'not_required',
                default => null,
            };

            DB::table('bookings')->where('id', $row->id)->update([
                'form_data' => json_encode((object) $form),
                'appointment_date' => $date,
                'appointment_start' => $start,
                'appointment_end' => $end,
                'status' => $status,
                'status_reason' => $row->rejection_reason,
                'payment_status' => $payment,
                // A legacy pending payment on a still-submitted booking gets a
                // fresh 48-hour hold. Left null it would hold its slot forever,
                // be skipped by the expiry job, and be refused by the payment
                // endpoint (which needs a future hold).
                'payment_hold_expires_at' => $status === 'submitted' && $row->payment_status === 'pending'
                    ? Carbon::now()->addHours(48)
                    : null,
            ]);
        });

        Schema::table('bookings', function (Blueprint $table) {
            $table->dropColumn(['payment_method', 'receipt_url', 'rejection_reason']);
        });
    }

    public function down(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->string('payment_method')->nullable();
            $table->string('receipt_url')->nullable();
            $table->string('rejection_reason')->nullable();
        });

        DB::table('bookings')->orderBy('id')->each(function ($row) {
            $form = json_decode($row->form_data ?? '{}', true) ?: [];
            if ($row->appointment_date) $form['appointmentDate'] = substr($row->appointment_date, 0, 10);
            if ($row->appointment_start) $form['appointmentTime'] = $row->appointment_start;

            DB::table('bookings')->where('id', $row->id)->update([
                'form_data' => json_encode((object) $form),
                'status' => $row->status === 'declined' ? 'rejected' : $row->status,
                'rejection_reason' => $row->status_reason,
                'payment_status' => $row->payment_status === 'unpaid' ? 'pending' : $row->payment_status,
            ]);
        });

        Schema::table('bookings', function (Blueprint $table) {
            // SQLite refuses to drop an indexed column while the index exists.
            $table->dropIndex(['appointment_date']);
        });

        Schema::table('bookings', function (Blueprint $table) {
            $table->dropColumn([
                'appointment_date', 'appointment_start', 'appointment_end', 'is_offsite', 'is_emergency',
                'payment_hold_expires_at', 'returned_at', 'status_reason', 'return_note',
                'refund_reference', 'refunded_at',
            ]);
        });
    }

    private static function normalizeDate(mixed $value): ?string
    {
        if (! is_string($value) || $value === '') return null;
        try {
            return Carbon::parse(substr($value, 0, 10))->toDateString();
        } catch (\Throwable) {
            return null;
        }
    }

    private static function normalizeTime(mixed $value): ?string
    {
        if (! is_string($value) || trim($value) === '') return null;
        foreach (['H:i', 'g:i A', 'g:iA', 'h:i A', 'H:i:s'] as $format) {
            try {
                $parsed = Carbon::createFromFormat($format, strtoupper(trim($value)));
                if ($parsed !== false) return $parsed->format('H:i');
            } catch (\Throwable) {
                // try the next format
            }
        }

        return null;
    }
};
