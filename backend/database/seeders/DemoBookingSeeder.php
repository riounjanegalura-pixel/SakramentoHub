<?php

namespace Database\Seeders;

use App\Models\AuditLog;
use App\Models\Booking;
use App\Models\BookingDocumentReview;
use App\Models\Service;
use App\Models\User;
use App\Services\Register\ParishRegister;
use App\Services\Scheduling\AppointmentRequest;
use App\Services\Scheduling\SchedulingService;
use App\Support\ParishClock;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

/**
 * Realistic demo bookings for demos: one per service (and a second,
 * completed baptism with a verifiable certificate), each in a
 * different lifecycle state, with complete form data.
 *
 * The form data comes from database/seeders/demo/, copies of the shared
 * contracts/fixtures files: the deployed image contains only backend/, so
 * the seeder must not read outside it. DemoBookingSeederTest keeps the
 * copies equal to their source.
 *
 * The container re-seeds on every boot, so a booking is created only when
 * its reference number does not exist yet. An existing demo booking is left
 * exactly as staff left it, unless its demo state has lapsed: the expiry job
 * closed it ("Payment not completed" / "Not resubmitted"), or it is still
 * submitted, returned or approved with an appointment day that has passed.
 * A lapsed row is deleted (its reviews and notes cascade) and seeded afresh.
 *
 * Future appointments are not hand-picked: each one is the first slot the
 * SchedulingService accepts on or after its parish-day offset (lead time,
 * weekdays, blackouts incl. the Triduum, working hours, the Sunday baptism
 * session, one-priest overlap with the demo bookings seeded before it), so
 * the demo never shows a booking the system itself would refuse.
 */
class DemoBookingSeeder extends Seeder
{
    /** How many days past the offset to look for a valid slot before giving up. */
    private const SEARCH_DAYS = 180;

    /** The bundled fixture copies this seeder reads, relative to database/seeders/demo/. */
    public const FIXTURES = [
        'baptism/valid-basic',
        'wedding/valid-basic',
        'confirmation/valid-basic',
        'funeral/valid-basic',
        'anointing/valid-hospital',
        'house-blessing/valid-house',
    ];

    public function run(): void
    {
        $owner = User::where('email', 'test@example.com')->first();
        if (! $owner) {
            return;
        }

        $scheduling = app(SchedulingService::class);
        $today = ParishClock::today();

        // The office desk is run by the admin account (there is no staff role any more).
        $staff = User::where('role', 'admin')->where('is_active', true)->orderBy('id')->first();

        // [reference, sacrament, fixture, status, payment, day offset, preferred start, amount, walk-in contact|null]
        $rows = [
            ['DEMO-BAPT', 'baptism', 'baptism/valid-basic', 'approved', 'paid', 9, '10:00', 10000, null],
            ['DEMO-WEDD', 'wedding', 'wedding/valid-basic', 'submitted', 'unpaid', 120, '10:00', 500000, null],
            ['DEMO-CONF', 'confirmation', 'confirmation/valid-basic', 'returned', 'not_required', 20, '09:00', 0, null],
            ['DEMO-FUNE', 'funeral', 'funeral/valid-basic', 'completed', 'not_required', -3, '13:00', 0, null],
            // A completed baptism for demos: its certificate verifies with a number and code that never change.
            ['DEMO-DONE', 'baptism', 'baptism/valid-basic', 'completed', 'paid', -30, '10:00', 10000, null],
            ['DEMO-ANOI', 'anointing', 'anointing/valid-hospital', 'submitted', 'not_required', 1, '15:00', 0, null],
            ['DEMO-HOUS', 'house-blessing', 'house-blessing/valid-house', 'declined', 'not_required', 10, '14:00', 0, null],
            ['DEMO-WALK', 'house-blessing', 'house-blessing/valid-house', 'approved', 'not_required', 6, '09:00', 0,
                ['fullName' => 'Aling Rosa Dela Cruz', 'phone' => '09171234567', 'email' => null]],
        ];

        foreach ($rows as [$ref, $sacrament, $fixture, $status, $payment, $offset, $preferred, $amount, $contact]) {
            $existing = Booking::where('reference_number', $ref)->first();
            if ($existing !== null) {
                if (! $this->lapsed($existing, $today->toDateString())) {
                    if ($existing->status->value === 'completed') {
                        app(ParishRegister::class)->record($existing, null, fixedCode: true); // a no-op once it has its entry
                    }

                    continue; // staff may have worked on it — leave it exactly as it is
                }
                $existing->delete(); // reviews and notes go with it (cascade)
            }

            if ($contact !== null && $staff === null) {
                Log::warning("Demo booking {$ref} skipped: there is no active admin account.");

                continue;
            }

            $json = file_get_contents(database_path("seeders/demo/{$fixture}.json"));
            $formData = json_decode(\App\Support\FixtureDates::expand(str_replace('{OWNER}', $owner->id, $json)), true)['formData'];
            array_walk_recursive($formData, function ($v) {
                if (is_string($v) && str_starts_with($v, '/documents/') && ! Storage::disk('local')->exists(ltrim($v, '/'))) {
                    Storage::disk('local')->put(ltrim($v, '/'), 'Demo document');
                }
            });

            $service = Service::findOrFail($sacrament);
            $from = $today->addDays($offset);

            // A completed booking lies in the past, where the scheduler (rightly)
            // accepts nothing — keep its fixed time on the parish day.
            $request = $offset < 0
                ? AppointmentRequest::make($service, $from->toDateString(), $preferred, $formData)
                : $this->firstValidSlot($scheduling, $service, $formData, $from, $preferred);

            if ($request === null) {
                // Never abort `migrate --seed` (and so the container boot) over one demo row.
                Log::warning("Demo booking {$ref} skipped: no free {$sacrament} slot within ".self::SEARCH_DAYS." days of {$from->toDateString()}.");

                continue;
            }

            $booking = Booking::create([
                'reference_number' => $ref,
                'user_id' => $contact === null ? $owner->id : null,
                'sacrament' => $sacrament,
                'status' => $status,
                'payment_status' => $payment,
                'amount_due_centavos' => $amount,
                'form_data' => $formData,
                'appointment_date' => $request->date,
                'appointment_start' => $request->start,
                'appointment_end' => $scheduling->endFor($request),
                'is_offsite' => $request->offsite,
                'payment_hold_expires_at' => $payment === 'unpaid' ? now()->addHours(48) : null,
                'returned_at' => $status === 'returned' ? now() : null,
                'return_note' => $status === 'returned' ? 'Please upload a clearer copy of the baptismal certificate.' : null,
                'status_reason' => $status === 'declined' ? 'The requested date conflicts with the parish fiesta.' : null,
            ] + ($contact === null ? [] : [
                'channel' => 'walk_in', 'created_by' => $staff->id, 'owner_snapshot' => $contact,
            ]));

            if ($status === 'completed') {
                // The completed demo booking carries a verifiable certificate even before register:backfill runs.
                app(ParishRegister::class)->record($booking, null, fixedCode: true);
            }

            if (in_array($status, ['approved', 'completed'], true)) {
                foreach ($booking->documentChecklist() as $doc) {
                    if ($doc['url'] !== null) {
                        BookingDocumentReview::create([
                            'booking_id' => $booking->id, 'document_key' => $doc['key'], 'file_url' => $doc['url'], 'status' => 'accepted',
                        ]);
                    }
                }
            }

            if ($status === 'returned') {
                // What returnForChanges() records: the slot the booking still holds (Booking::heldSlot).
                AuditLog::create([
                    'actor_user_id' => null,
                    'action' => 'booking.returned',
                    'subject_type' => 'booking',
                    'subject_id' => $booking->id,
                    'metadata' => [
                        'note' => $booking->return_note,
                        'appointmentDate' => $request->date,
                        'appointmentStart' => $request->start,
                        'actorName' => 'Parish Office',
                        'actorEmail' => null,
                        'reference' => $ref,
                    ],
                    'created_at' => now(),
                ]);
            }
        }
    }

    /** A demo row is stale when the expiry job closed it, or its appointment day has gone by while still open. */
    private function lapsed(Booking $b, string $today): bool
    {
        $expired = $b->status->value === 'cancelled'
            && (str_starts_with((string) $b->status_reason, 'Payment not completed') || str_starts_with((string) $b->status_reason, 'Not resubmitted'));
        $pastOpen = in_array($b->status->value, ['submitted', 'returned', 'approved'], true)
            && $b->appointmentDateString() !== null && $b->appointmentDateString() < $today;

        return $expired || $pastOpen;
    }

    /** @param array<string, mixed> $formData */
    private function firstValidSlot(SchedulingService $scheduling, Service $service, array $formData, $from, string $preferred): ?AppointmentRequest
    {
        for ($i = 0; $i <= self::SEARCH_DAYS; $i++) {
            $request = AppointmentRequest::make($service, $from->addDays($i)->toDateString(), null, $formData);
            $free = $scheduling->freeStarts($request);

            if ($free !== []) {
                return $request->withStart(in_array($preferred, $free, true) ? $preferred : $free[0]);
            }
        }

        return null;
    }
}
