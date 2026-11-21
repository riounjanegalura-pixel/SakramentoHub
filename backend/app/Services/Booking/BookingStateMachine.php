<?php

namespace App\Services\Booking;

use App\Enums\BookingStatus as S;
use App\Enums\PaymentStatus as P;
use App\Exceptions\BookingRuleViolation;
use App\Models\AuditLog;
use App\Models\Booking;
use App\Models\ParishSetting;
use App\Models\User;
use App\Services\PayMongo\PayMongoClient;
use App\Services\PayMongo\PayMongoException;
use App\Services\Register\ParishRegister;
use App\Services\Scheduling\SchedulingService;
use App\Support\ParishClock;
use App\Support\StoredDocuments;
use App\Validation\SacramentDocuments;
use App\Validation\SacramentRules;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;

/**
 * The only code that changes a booking's status or payment status (spec §3).
 * Every method re-reads the row under a lock inside a transaction, checks the
 * transition table, writes an audit row and notifies null-safely.
 */
class BookingStateMachine
{
    public const PAYMENT_HOLD_HOURS = 48;
    public const CANCEL_APPROVED_MIN_DAYS = 3;

    /** Undecided (submitted) bookings one parishioner account may hold at once. See the 2026-10-11 backend plan. */
    public const MAX_UNDECIDED_SUBMISSIONS = 3;

    public function __construct(
        private SchedulingService $scheduling,
        private BookingAudit $audit,
        private BookingNotifier $notify,
        private PayMongoClient $paymongo,
        private ParishRegister $register,
        private WeddingMilestones $milestones,
    ) {}

    /**
     * $waiveLeadTime lifts only the lead time (and the same-day "an hour from
     * now" cutoff). It is honoured only for a staff-side actor submitting a
     * walk-in the office entered; every other scheduling rule still applies.
     */
    public function submit(Booking $booking, User $actor, bool $waiveLeadTime = false, ?string $waiveReason = null): Booking
    {
        return $this->locked($booking, function (Booking $b) use ($actor, $waiveLeadTime, $waiveReason) {
            $from = $b->status;
            if (! in_array($from, [S::Draft, S::Returned], true)) {
                throw new BookingRuleViolation("This booking can't be submitted from its current state ({$from->label()}).");
            }

            // Staff-created bookings belong to the desk, not to the parishioner's own quota.
            if ($b->channel !== 'walk_in' && $b->user_id !== null) {
                $undecided = Booking::query()
                    ->where('user_id', $b->user_id)
                    ->where('status', S::Submitted->value)
                    ->where('channel', '!=', 'walk_in')
                    ->whereKeyNot($b->id)
                    ->count();

                if ($undecided >= self::MAX_UNDECIDED_SUBMISSIONS) {
                    throw new BookingRuleViolation('You already have '.self::MAX_UNDECIDED_SUBMISSIONS.' bookings waiting for the parish office to review. Wait for a decision before sending another.');
                }
            }

            SacramentRules::validate($b->sacrament, (array) ($b->form_data ?? []), $b->user_id, $b->created_by, $b->channel === 'walk_in');

            $amount = $b->computeAmountDue();
            $alreadyPaid = $b->payment_status === P::Paid;
            // A parishioner who chose cash keeps that choice through a return and resubmit.
            $cashChosen = $b->payment_status === P::PendingCash;
            if ($b->payment_status === P::RefundDue) {
                throw new BookingRuleViolation('The parish office is processing a refund for this booking. You can resubmit once it is done.');
            }
            if ($alreadyPaid && $amount > (int) $b->amount_due_centavos) {
                throw new BookingRuleViolation('Your changes raise the fee from ₱'.number_format((int) $b->amount_due_centavos / 100, 2).' to ₱'.number_format($amount / 100, 2).'. Please contact the parish office at '.ParishSetting::parishPhone().' to settle the difference.');
            }

            $emergency = $b->sacrament === 'anointing' && (bool) ($b->form_data['inDangerOfDeath'] ?? false);
            // The priest has no slot to go on, only a phone: refuse before any state change if nobody can be called.
            $mobiles = $emergency ? $this->reachableMobiles($b) : [];
            if ($emergency && $mobiles === []) {
                throw ValidationException::withMessages(['formData.alternatePhone' => ['Add a mobile number we can call right now (09XXXXXXXXX). The priest needs it to reach you.']]);
            }
            // Only the office may waive lead time, and only for a booking it entered itself.
            $waived = false;
            if ($emergency) {
                $b->fill(['is_emergency' => true, 'appointment_date' => null, 'appointment_start' => null, 'appointment_end' => null]);
            } else {
                if (! $b->appointmentDateString()) {
                    throw new BookingRuleViolation('Choose an appointment date and time.');
                }
                $request = $b->appointmentRequest();
                $this->lockDay($b->appointmentDateString());
                // A returned booking resubmitted with the slot it still holds
                // is only checked for hard conflicts (see heldSlotConflict),
                // so rule changes since never strand it. A changed date or
                // start gets the full check, lead time and cutoff included.
                $waived = $waiveLeadTime && $b->channel === 'walk_in'
                    && in_array($actor->role, config('roles.staff_side'), true);
                $violation = $b->holdsItsReturnedSlot()
                    ? $this->scheduling->heldSlotConflict($request, $b->id)
                    : $this->scheduling->check($request, $b->id, ! $waived);
                if ($violation) {
                    throw new BookingRuleViolation($violation);
                }
                $b->fill([
                    'is_emergency' => false,
                    'appointment_end' => $this->scheduling->endFor($request),
                    'is_offsite' => $request->offsite,
                ]);
            }

            $b->fill([
                'status' => S::Submitted,
                'amount_due_centavos' => $amount,
                'payment_status' => match (true) {
                    $alreadyPaid => P::Paid,
                    $amount > 0 => $cashChosen ? P::PendingCash : P::Unpaid,
                    default => P::NotRequired,
                },
                // Approval first: no payment deadline while the office reviews (the payment window opens on approval).
                'payment_hold_expires_at' => ($amount > 0 && ! $alreadyPaid && ! $this->approvalFirst($b)) ? $this->holdDeadline($b) : null,
                'returned_at' => null,
            ])->save();

            $this->audit->record($actor, $from === S::Returned ? 'booking.resubmitted' : 'booking.submitted', $b,
                ['from' => $from->value] + ($waived ? ['leadTimeWaived' => true, 'waiveReason' => $waiveReason] : []));

            if ($alreadyPaid && ($over = $b->overpaidCentavos()) > 0) {
                $this->audit->record(null, 'booking.overpaid', $b, ['overpaidCentavos' => $over]);
                $this->notify->staff('Partial refund due', "{$b->reference_number} was resubmitted with a lower fee. Refund ₱".number_format($over / 100, 2).' in the PayMongo dashboard, then record it on the booking.', $b);
            }

            if ($emergency) {
                $this->notify->staff(
                    'Urgent anointing request',
                    "Patient in danger of death — {$b->reference_number}. Contact the family right away: ".implode(' or ', $mobiles).'.',
                    $b,
                );
            }

            return $b;
        });
    }

    /** @return list<string> the mobile numbers (09XXXXXXXXX) the family can be reached on, without duplicates */
    private function reachableMobiles(Booking $b): array
    {
        $numbers = [];
        foreach ([$b->contactPhone(), $b->form_data['alternatePhone'] ?? null] as $raw) {
            $n = preg_replace('/[\s-]+/', '', (string) $raw);
            if (str_starts_with($n, '+639')) {
                $n = '0'.substr($n, 3);
            }
            if (preg_match('/^09\d{9}$/', $n)) {
                $numbers[] = $n;
            }
        }

        return array_values(array_unique($numbers));
    }

    public function approve(Booking $booking, User $staff): Booking
    {
        return $this->locked($booking, function (Booking $b) use ($staff) {
            $this->requireTransition($b, S::Approved, 'approved');
            $approvalFirst = $this->approvalFirst($b);
            if (! $approvalFirst && $b->payment_status === P::PendingCash) {
                throw new BookingRuleViolation('This booking cannot be approved until the cash payment is received and recorded.');
            }
            if (! $approvalFirst && ! in_array($b->payment_status, [P::Paid, P::NotRequired, null], true)) {
                throw new BookingRuleViolation('This booking cannot be approved until its GCash payment is confirmed by PayMongo.');
            }
            if (! $b->documentsCleared()) {
                throw new BookingRuleViolation('Review every uploaded document before approving.');
            }
            if (! $b->is_emergency && $b->appointmentDateString()) {
                $this->lockDay($b->appointmentDateString());
                // The booking already holds this slot: only hard conflicts
                // count, not the slot grid, hours or weekdays as they are today.
                if ($violation = $this->scheduling->heldSlotConflict($b->appointmentRequest(), $b->id)) {
                    throw new BookingRuleViolation("Cannot approve: {$violation}");
                }
            }

            // Approval first: an approved booking with a fee now has its payment window (the same 48 hours as before).
            $payNow = $approvalFirst && $b->payment_status?->awaitingPayment();
            $b->update(['status' => S::Approved] + ($payNow ? ['payment_hold_expires_at' => $this->holdDeadline($b)] : []));
            $this->audit->record($staff, 'booking.approved', $b, ['from' => 'submitted'] + ($payNow ? ['awaitingPayment' => true] : []));
            $this->notify->owner($b, 'Booking Approved', "Your {$this->notify->sacramentLabel($b)} booking ({$b->reference_number}) has been approved."
                .($payNow ? ' Please pay the ₱'.number_format((int) $b->amount_due_centavos / 100, 2).' fee by '.$this->deadlineText($b->payment_hold_expires_at).' to keep your schedule.' : ''), mail: true);

            return $b;
        });
    }

    public function decline(Booking $booking, User $staff, string $reason): Booking
    {
        return $this->locked($booking, function (Booking $b) use ($staff, $reason) {
            $from = $this->requireTransition($b, S::Declined, 'declined');
            $this->settlePaymentOnClose($b);
            $b->fill(['status' => S::Declined, 'status_reason' => $reason])->save();

            $this->audit->record($staff, 'booking.declined', $b, ['from' => $from->value, 'reason' => $reason]);
            $this->notify->owner($b, 'Booking Declined', "Your {$this->notify->sacramentLabel($b)} booking ({$b->reference_number}) was declined: {$reason}", mail: true);

            return $b;
        });
    }

    public function returnForChanges(Booking $booking, User $staff, ?string $note = null): Booking
    {
        return $this->locked($booking, function (Booking $b) use ($staff, $note) {
            $this->requireTransition($b, S::Returned, 'returned for changes');
            $rejected = $b->rejectedDocumentLabels();
            $note = trim((string) $note);
            if ($note === '' && $rejected === []) {
                throw new BookingRuleViolation('Write what needs to change, or reject at least one document.');
            }
            $stored = $note !== '' ? $note : 'Please replace the documents marked as rejected.';

            $b->update([
                'status' => S::Returned,
                'return_note' => $stored,
                'returned_at' => now(),
                'payment_hold_expires_at' => null, // the 7-day returned hold applies instead
            ]);

            // The slot is recorded so resubmit can tell "kept the held slot" from "moved it" (Booking::heldSlot).
            $this->audit->record($staff, 'booking.returned', $b, [
                'note' => $stored,
                'rejectedDocuments' => $rejected,
                'appointmentDate' => $b->appointmentDateString(),
                'appointmentStart' => $b->appointment_start,
            ]);
            $documents = $rejected === [] ? '' : ' Documents to replace: '.implode(', ', $rejected).'.';
            $this->notify->owner($b, 'Booking needs changes', "The parish office returned your {$this->notify->sacramentLabel($b)} booking ({$b->reference_number}): {$stored}{$documents} Please update it within 7 days.", mail: true);

            return $b;
        });
    }

    /** Cancels a stale hold only if it is still stale once the row is locked. */
    public function expireStaleHold(Booking $booking): bool
    {
        return $this->locked($booking, function (Booking $b) {
            $unpaidExpired = in_array($b->status, [S::Submitted, S::Approved], true)
                && $b->payment_status?->awaitingPayment()
                && $b->payment_hold_expires_at !== null
                && $b->payment_hold_expires_at->lte(now());
            $returnedStale = $b->status === S::Returned
                && $b->returned_at !== null
                && ($b->returned_at->lte(now()->subDays(7)) || $b->appointmentStartsAt()?->lte(now()));

            if (! $unpaidExpired && ! $returnedStale) {
                return false;
            }

            $this->cancel($b, null, $unpaidExpired
                ? 'Payment not completed by '.$this->deadlineText($b->payment_hold_expires_at).'.'
                : ($b->returned_at->lte(now()->subDays(7)) ? 'Not resubmitted within 7 days.' : 'Not resubmitted before the appointment time.'));

            return true;
        });
    }

    public function cancel(Booking $booking, ?User $actor, string $reason): Booking
    {
        return $this->locked($booking, function (Booking $b) use ($actor, $reason) {
            $from = $this->requireTransition($b, S::Cancelled, 'cancelled');
            $byOwner = $actor !== null && $actor->id === $b->user_id && ! in_array($actor->role, config('roles.staff_side'), true);

            if ($byOwner && $from === S::Approved && $b->appointmentDateString()
                && ParishClock::today()->addDays(self::CANCEL_APPROVED_MIN_DAYS)->toDateString() > $b->appointmentDateString()) {
                throw new BookingRuleViolation('Approved bookings can only be cancelled online until 3 days before the appointment. Please call the parish office at '.ParishSetting::parishPhone().'.');
            }

            $wasPaid = $b->payment_status === P::Paid;
            $this->settlePaymentOnClose($b);
            $b->fill(['status' => S::Cancelled, 'status_reason' => $reason])->save();

            $this->audit->record($actor, 'booking.cancelled', $b, ['from' => $from->value, 'reason' => $reason]);
            if ($byOwner) {
                if ($from === S::Approved || $wasPaid) {
                    $this->notify->staff('Booking cancelled by parishioner', "{$b->reference_number} ({$this->notify->sacramentLabel($b)}) was cancelled by the parishioner: {$reason}", $b);
                }
            } else {
                $this->notify->owner($b, 'Booking Cancelled', "Your {$this->notify->sacramentLabel($b)} booking ({$b->reference_number}) was cancelled: {$reason}", mail: true);
            }

            return $b;
        });
    }

    public function complete(Booking $booking, User $staff): Booking
    {
        return $this->locked($booking, function (Booking $b) use ($staff) {
            $this->requireTransition($b, S::Completed, 'marked completed');
            $date = $b->appointmentDateString();
            if ($date !== null && ParishClock::todayString() < $date) {
                throw new BookingRuleViolation('A booking can only be completed on or after its appointment date.');
            }
            // A wedding's preparation must be on record first; staff can tick any step by hand, so this is never a missing upload.
            if ($open = $this->milestones->openGatingLabels($b)) {
                throw new BookingRuleViolation('Cannot complete: these preparation steps are not done — '.implode(', ', $open).'.');
            }

            $b->update(['status' => S::Completed]);
            $this->audit->record($staff, 'booking.completed', $b);
            // Same transaction: a completed booking always has its register entry, or it is not completed.
            $entry = $this->register->record($b, $staff);
            $this->notify->owner($b, 'Sacrament recorded', "Your {$this->notify->sacramentLabel($b)} ({$b->reference_number}) is complete. Your certificate {$entry->register_number} is ready to view.", mail: true, actionLabel: 'View certificate', walkInUrl: $entry->verify_code !== null ? $this->notify->verifyUrl() : null);

            return $b;
        });
    }

    /**
     * Records that the party arrived. A write under the booking lock with an audit row; the status does not move
     * (completing is its own, later action).
     */
    public function checkIn(Booking $booking, User $staff): Booking
    {
        return $this->locked($booking, function (Booking $b) use ($staff) {
            if ($b->status !== S::Approved) {
                throw new BookingRuleViolation('Only an approved booking can be checked in.');
            }
            $date = $b->appointmentDateString();
            if ($date === null) {
                throw new BookingRuleViolation('This booking has no appointment to check in for.');
            }
            if ($date !== ParishClock::todayString()) {
                throw new BookingRuleViolation('Check-in opens on the appointment day ('.CarbonImmutable::parse($date)->format('F j, Y').').');
            }
            if ($b->checked_in_at !== null) {
                $at = CarbonImmutable::instance($b->checked_in_at)->setTimezone(config('app.parish_timezone', 'Asia/Manila'));
                throw new BookingRuleViolation('Already checked in at '.$at->format('g:i A').'.');
            }

            $b->update(['checked_in_at' => now(), 'checked_in_by' => $staff->id]);
            $this->audit->record($staff, 'booking.checked_in', $b);

            return $b;
        });
    }

    /**
     * Adds one of a wedding's later documents (license, Pre-Cana, banns, confession) after submission. A write
     * under the booking lock: the status does not move, so an approved wedding stays approved. The caller has
     * already checked that the file is one this actor may attach.
     */
    public function attachLateDocument(Booking $booking, string $key, string $fileUrl, User $actor): Booking
    {
        $old = null;
        $result = $this->locked($booking, function (Booking $b) use ($key, $fileUrl, $actor, &$old) {
            if ($b->sacrament !== 'wedding') {
                throw new BookingRuleViolation('Documents can be added later only to a wedding booking.');
            }
            if (! in_array($key, WeddingMilestones::LATE_KEYS, true)) {
                throw new BookingRuleViolation('Only the marriage license, Pre-Cana, banns and confession documents can be added after the booking is submitted.');
            }
            if (! in_array($b->status, [S::Submitted, S::Approved], true)) {
                throw new BookingRuleViolation('Documents can be added only while the booking is submitted or approved.');
            }

            $data = (array) ($b->form_data ?? []);
            $replaced = is_string($data[$key] ?? null) && $data[$key] !== '';
            $old = $replaced && $data[$key] !== $fileUrl ? $data[$key] : null;
            $data[$key] = $fileUrl; // a review of the earlier file no longer counts (Booking::documentChecklist)
            $b->update(['form_data' => $data]);

            $label = collect(SacramentDocuments::catalogue('wedding'))->firstWhere('key', $key)['label'];
            $this->audit->record($actor, 'document.attached_late', $b, ['documentKey' => $key, 'label' => $label, 'replaced' => $replaced]);
            $this->notify->staff('Document added', "{$b->reference_number}: {$label} was uploaded and needs review.", $b);

            return $b;
        });

        // After the commit: the replaced file goes unless another booking, a review or a wallet row still uses it.
        if ($old !== null) {
            StoredDocuments::deleteIfUnreferenced($old);
        }

        return $result;
    }

    public function reschedule(Booking $booking, User $owner, string $date, string $start): Booking
    {
        return $this->locked($booking, function (Booking $b) use ($owner, $date, $start) {
            if (! in_array($b->status, [S::Submitted, S::Approved], true)) {
                throw new BookingRuleViolation('Only a submitted or approved booking can be rescheduled.');
            }
            if ($b->status === S::Approved && $b->appointmentDateString()
                && ParishClock::today()->addDays(self::CANCEL_APPROVED_MIN_DAYS)->toDateString() > $b->appointmentDateString()) {
                throw new BookingRuleViolation('Approved bookings can only be rescheduled online until 3 days before the appointment. Please call the parish office at '.ParishSetting::parishPhone().'.');
            }
            $request = $b->appointmentRequest($date, $start);
            $this->lockDay($date);
            if ($violation = $this->scheduling->check($request, $b->id)) {
                throw new BookingRuleViolation($violation);
            }

            $wasApproved = $b->status === S::Approved;
            $b->update([
                'appointment_date' => $date,
                'appointment_start' => $start,
                'appointment_end' => $this->scheduling->endFor($request),
                'is_offsite' => $request->offsite,
                'is_emergency' => false, // it now has a real slot
                'status' => S::Submitted,
                'checked_in_at' => null, 'checked_in_by' => null, // the check-in belonged to the old day
            ]);
            $this->shortenOpenHold($b);

            $this->audit->record($owner, 'booking.rescheduled', $b, ['date' => $date, 'start' => $start, 'wasApproved' => $wasApproved]);
            $this->milestones->recheckLicense($b, $owner);
            $this->notify->owner($b, 'Booking Rescheduled', "Your {$this->notify->sacramentLabel($b)} booking is now on {$date} at {$start}.".($wasApproved ? ' The parish will review the new schedule.' : ''));
            if ($wasApproved) {
                $this->notify->staff('Approved booking rescheduled', "{$b->reference_number} moved to {$date} {$start} and needs re-approval.", $b);
            }

            return $b;
        });
    }

    /** The office moves an appointment. Staff made the change, so the status is not sent back for review. */
    public function rescheduleByStaff(Booking $booking, User $staff, string $date, string $start, string $reason, bool $waiveLeadTime = false): Booking
    {
        return $this->locked($booking, function (Booking $b) use ($staff, $date, $start, $reason, $waiveLeadTime) {
            if (! in_array($b->status, [S::Submitted, S::Approved], true)) {
                throw new BookingRuleViolation('Only a submitted or approved booking can be rescheduled.');
            }
            $request = $b->appointmentRequest($date, $start);
            $this->lockDay($date);
            // Lead time is the only rule the office may waive; conflicts, blackouts and hours always apply.
            if ($violation = $this->scheduling->check($request, $b->id, bookingTime: ! $waiveLeadTime)) {
                throw new BookingRuleViolation($violation);
            }

            $from = ['fromDate' => $b->appointmentDateString(), 'fromStart' => $b->appointment_start];
            $b->update([
                'appointment_date' => $date,
                'appointment_start' => $start,
                'appointment_end' => $this->scheduling->endFor($request),
                'is_offsite' => $request->offsite,
                'is_emergency' => false,
                'checked_in_at' => null, 'checked_in_by' => null,
            ]);
            $this->shortenOpenHold($b);

            $this->audit->record($staff, 'booking.rescheduled_by_staff', $b, $from + ['date' => $date, 'start' => $start, 'reason' => $reason, 'leadTimeWaived' => $waiveLeadTime]);
            $this->milestones->recheckLicense($b, $staff);
            $this->notify->owner($b, 'Booking Rescheduled', "The parish office moved your {$this->notify->sacramentLabel($b)} booking ({$b->reference_number}) to {$date} at {$start}: {$reason}", mail: true);

            return $b;
        });
    }

    public function markRefunded(Booking $booking, User $staff, string $reference, ?string $note = null): Booking
    {
        return $this->locked($booking, function (Booking $b) use ($staff, $reference, $note) {
            if ($b->payment_status !== P::RefundDue) {
                throw new BookingRuleViolation('Only a booking with a refund due can be marked refunded.');
            }

            // What is still owed back: the amount paid less anything already refunded in part.
            $amount = $b->amount_paid_centavos !== null
                ? max(0, (int) $b->amount_paid_centavos - (int) $b->amount_refunded_centavos)
                : (int) $b->amount_due_centavos;
            $paymentId = $b->paymongo_payment_id;
            // An open booking with a fee gets a way back to paid instead of a dead end.
            $reopen = (in_array($b->status, [S::Submitted, S::Returned], true) || ($b->status === S::Approved && $this->approvalFirst($b))) && (int) $b->amount_due_centavos > 0;
            // Read before the reopen clears it: cash is handed back at the parish office, not through GCash.
            $paidInCash = $b->payment_method === 'cash';

            $b->update(['refund_reference' => $reference, 'refunded_at' => now()] + ($reopen ? [
                'payment_status' => P::Unpaid,
                'payment_hold_expires_at' => in_array($b->status, [S::Submitted, S::Approved], true) ? $this->holdDeadline($b) : null,
                'paymongo_checkout_session_id' => null, // a fresh checkout; the old payment id stays so a replay is still a duplicate
                'payment_method' => null, // chosen again with the next payment, so no stale cash receipt shows
                'cash_receipt_reference' => null,
                'paid_at' => null,
                'amount_paid_centavos' => null,
                'amount_refunded_centavos' => 0,
            ] : [
                'payment_status' => P::Refunded,
                'amount_refunded_centavos' => (int) $b->amount_refunded_centavos + $amount,
            ]));

            // paymentId is kept in the audit row so a late replay of this payment stays a duplicate even after a new payment replaces it on the booking.
            $this->audit->record($staff, 'booking.refunded', $b, ['reference' => $reference, 'note' => $note, 'amountCentavos' => $amount, 'paymentId' => $paymentId, 'reopenedForPayment' => $reopen]);
            $shown = '₱'.number_format($amount / 100, 2);
            $payBy = $b->payment_hold_expires_at !== null ? 'by '.$this->deadlineText($b->payment_hold_expires_at) : 'soon';
            $body = match (true) {
                $paidInCash && $reopen => "Your cash payment of {$shown} for {$b->reference_number} was returned at the parish office (reference {$reference}). Please pay again {$payBy} to keep your schedule.",
                $paidInCash => "Your cash payment of {$shown} for {$b->reference_number} was returned at the parish office (reference {$reference}).",
                $reopen => "Your GCash payment of {$shown} for {$b->reference_number} was refunded (reference {$reference}). Please pay again {$payBy} to keep your schedule.",
                default => "Your GCash refund of {$shown} for {$b->reference_number} has been processed (reference {$reference}).",
            };
            $this->notify->owner($b, 'Refund processed', $body, mail: true);

            return $b;
        });
    }

    public function recordPartialRefund(Booking $booking, User $staff, string $reference, int $amountCentavos): Booking
    {
        return $this->locked($booking, function (Booking $b) use ($staff, $reference, $amountCentavos) {
            $over = $b->overpaidCentavos();
            if ($over <= 0) {
                throw new BookingRuleViolation('This booking has no overpayment to refund.');
            }
            if ($amountCentavos < 1 || $amountCentavos > $over) {
                throw new BookingRuleViolation('The refund cannot be more than the overpaid amount of ₱'.number_format($over / 100, 2).'.');
            }

            $b->update(['amount_refunded_centavos' => $b->amount_refunded_centavos + $amountCentavos]);
            $this->audit->record($staff, 'booking.partial_refund', $b, ['reference' => $reference, 'amountCentavos' => $amountCentavos]);
            $this->notify->owner($b, 'Partial refund processed', '₱'.number_format($amountCentavos / 100, 2)." was refunded to your GCash for {$b->reference_number} (reference {$reference}).", mail: true);

            return $b;
        });
    }

    /**
     * The owner will pay cash at the parish office. Only an unpaid, submitted booking with a live hold; the hold
     * keeps its deadline (choosing cash never lengthens it), so the slot is held exactly as long as for GCash and
     * bookings:expire-holds cancels it the same way. Choosing again while cash is pending changes nothing.
     */
    public function chooseCash(Booking $booking, User $owner): Booking
    {
        return $this->locked($booking, function (Booking $b) use ($owner) {
            if ($b->payment_status === P::Paid) {
                throw new BookingRuleViolation('This booking has already been paid.');
            }
            // Cash can also be chosen on an approved booking, but only under approval-before-payment (otherwise approval needs payment first).
            $cashStatuses = $this->approvalFirst($b) ? [S::Submitted, S::Approved] : [S::Submitted];
            if ($b->payment_status === P::PendingCash && in_array($b->status, $cashStatuses, true)) {
                return $b;
            }
            if ($b->payment_status !== P::Unpaid) {
                throw new BookingRuleViolation('This booking has no payment due.');
            }
            if (! in_array($b->status, $cashStatuses, true)) {
                throw new BookingRuleViolation('Cash at the parish office can be chosen only for a submitted booking that is waiting for payment.');
            }
            if (! $b->payment_hold_expires_at?->isFuture()) {
                throw new BookingRuleViolation('The payment window for this booking has closed, so its time is no longer held. Please make a new booking.');
            }

            $b->update(['payment_status' => P::PendingCash, 'payment_method' => 'cash']);
            $this->audit->record($owner, 'booking.cash_chosen', $b, [
                'from' => P::Unpaid->value,
                'holdExpiresAt' => $b->payment_hold_expires_at->toISOString(),
            ]);

            return $b;
        });
    }

    /**
     * The office took the cash at the counter: for a booking whose owner chose cash (`pending_cash`), or straight
     * from `unpaid` (a walk-in paying at the desk, or a parishioner who just turned up with cash). Only while the
     * booking still holds its slot: once the hold has lapsed the time may be someone else's, so the cash is refused
     * rather than taken and owed back. `paid` is terminal here.
     */
    public function markCashReceived(Booking $booking, User $staff, ?string $receiptReference): Booking
    {
        return $this->locked($booking, function (Booking $b) use ($staff, $receiptReference) {
            $from = $b->payment_status;
            if (! $from?->awaitingPayment()) {
                throw new BookingRuleViolation('Only a booking waiting for payment can be marked as cash received.');
            }
            if (! in_array($b->status, [S::Submitted, S::Returned, S::Approved], true)) {
                throw new BookingRuleViolation("This booking is {$b->status->label()}, so no payment can be taken for it.");
            }
            if (! Booking::holdingSlot()->whereKey($b->id)->exists()) {
                throw new BookingRuleViolation('The hold on this booking has lapsed, so its time is no longer held. Do not take the cash: the parishioner needs to make a new booking.');
            }

            $amount = (int) $b->amount_due_centavos;
            $b->update([
                'payment_status' => P::Paid,
                'payment_method' => 'cash',
                'cash_receipt_reference' => $receiptReference,
                'paid_at' => now(),
                'amount_paid_centavos' => $amount,
                'payment_hold_expires_at' => null,
            ]);
            $this->audit->record($staff, 'booking.cash_received', $b, [
                'amountCentavos' => $amount,
                'receiptReference' => $receiptReference,
                'from' => $from->value,
                $from === P::PendingCash ? 'fromPendingCash' : 'fromUnpaid' => true,
            ]);
            // The fee is settled: a GCash checkout opened earlier must not take a second payment.
            $this->expireOpenCheckout($b);

            $receipt = $receiptReference !== null ? " (receipt {$receiptReference})" : '';
            $this->notify->owner($b, 'Payment Received', 'We received your ₱'.number_format($amount / 100, 2)." cash payment for {$b->reference_number} at the parish office{$receipt}.", mail: true);

            return $b;
        });
    }

    public function recordPayment(Booking $booking, ?string $sessionId, ?string $paymentId, int $amountCentavos, string $eventId): string
    {
        return $this->locked($booking, function (Booking $b) use ($sessionId, $paymentId, $amountCentavos, $eventId) {
            if ($paymentId !== null && ($b->paymongo_payment_id === $paymentId || $this->wasRefunded($b, $paymentId))) {
                return 'duplicate';
            }
            if ($b->payment_status === P::Paid) {
                if ($paymentId === null) {
                    return 'duplicate';
                }
                // A different payment on an already-paid booking: keep the first, flag the extra for refund.
                $this->audit->record(null, 'booking.payment_extra', $b, ['amountCentavos' => $amountCentavos, 'paymentId' => $paymentId, 'eventId' => $eventId]);
                $this->notify->staff('Refund due', "An extra GCash payment of ₱".number_format($amountCentavos / 100, 2)." (payment {$paymentId}) arrived for {$b->reference_number}, which is already paid. Refund it in the PayMongo dashboard.", $b);

                return 'refund_due';
            }

            $ids = [
                'paymongo_checkout_session_id' => $sessionId ?? $b->paymongo_checkout_session_id,
                'paymongo_payment_id' => $paymentId,
                'paid_at' => now(),
                'amount_paid_centavos' => $amountCentavos,
            ];

            // Money that can't be applied (closed booking, or less than the
            // amount due) is never dropped: it becomes refund_due for staff.
            // It also counts as the booking's only while the booking still holds its slot
            // (unpaid hold not lapsed, returned within 7 days). Otherwise the slot may be
            // re-sold, so the payment is refund due for staff.
            // A booking waiting for cash can still be paid by GCash: the parishioner changed their mind.
            $open = in_array($b->status, [S::Submitted, S::Returned, S::Approved], true)
                && $b->payment_status?->awaitingPayment()
                && $amountCentavos >= (int) $b->amount_due_centavos
                && Booking::holdingSlot()->whereKey($b->id)->exists();
            if (! $open) {
                $b->update($ids + ['payment_status' => P::RefundDue]);
                $this->audit->record(null, 'booking.payment_on_closed_booking', $b, ['amountCentavos' => $amountCentavos, 'eventId' => $eventId]);
                $this->notify->staff('Refund due', "A GCash payment of ₱".number_format($amountCentavos / 100, 2)." arrived for {$b->reference_number}, which is {$b->status->label()}. Refund it in the PayMongo dashboard, then mark it refunded.", $b);

                return 'refund_due';
            }

            $from = $b->payment_status;
            $b->update($ids + ['payment_status' => P::Paid, 'payment_method' => 'gcash', 'payment_hold_expires_at' => null]);
            $this->audit->record(null, 'booking.payment_confirmed', $b, ['amountCentavos' => $amountCentavos, 'eventId' => $eventId]
                + ($from === P::PendingCash ? ['fromPendingCash' => true] : []));

            if (config('paymongo.auto_approve_on_payment') && $b->status === S::Submitted && $b->documentsCleared()) {
                $b->update(['status' => S::Approved]);
                $this->audit->record(null, 'booking.approved', $b, ['from' => 'submitted', 'reason' => 'payment_confirmed']);
            }

            $this->notify->owner($b, 'Payment Received', "We received your ₱".number_format($amountCentavos / 100, 2)." GCash payment for {$b->reference_number}.", mail: true);

            return 'processed';
        });
    }

    /** True when this payment id was already refunded on the booking (read from the refund's audit row). */
    private function wasRefunded(Booking $b, string $paymentId): bool
    {
        return AuditLog::where('subject_type', 'booking')->where('subject_id', $b->id)->where('action', 'booking.refunded')
            ->get()->contains(fn (AuditLog $row) => ($row->metadata['paymentId'] ?? null) === $paymentId);
    }

    /** Closes an open GCash checkout so it can no longer be paid; a failure is only logged. */
    private function expireOpenCheckout(Booking $b): void
    {
        if (! $b->paymongo_checkout_session_id) {
            return;
        }
        try {
            $this->paymongo->expireCheckoutSession($b->paymongo_checkout_session_id);
        } catch (PayMongoException $e) {
            // A late payment is still caught by recordPayment() → refund_due.
            Log::warning('Could not expire PayMongo checkout session.', ['booking' => $b->id, 'error' => $e->getMessage()]);
        }
    }

    private function settlePaymentOnClose(Booking $b): void
    {
        // Cash not yet taken is like an unpaid fee: nothing to refund. (Refunding cash already taken is out of scope.)
        if ($b->payment_status?->awaitingPayment()) {
            $b->payment_status = P::Void;
            $b->payment_hold_expires_at = null;
            $this->expireOpenCheckout($b);
        } elseif ($b->payment_status === P::Paid) {
            $b->payment_status = P::RefundDue;
            $this->notify->staff('Refund due', $b->payment_method === 'cash'
                ? "{$b->reference_number} was closed after payment. It was paid in cash at the parish office, so return it there, then mark it refunded."
                : "{$b->reference_number} was closed after payment. Refund it in the PayMongo dashboard, then mark it refunded.", $b);
        }
    }

    /** True when this booking follows approval-before-payment (a desk walk-in keeps the older pay-then-approve order). */
    private function approvalFirst(Booking $b): bool
    {
        return (bool) config('paymongo.approval_before_payment') && $b->channel !== 'walk_in';
    }

    /**
     * When an unpaid hold ends: 48 hours from now, but never later than the appointment start, and never
     * less than an hour (a counter booking for "now" must not be cancelled mid-ceremony).
     */
    private function holdDeadline(Booking $b): \Carbon\CarbonInterface
    {
        $limit = now()->addHours(self::PAYMENT_HOLD_HOURS);
        $start = $b->appointmentStartsAt(); // parish-timezone start as an instant, null without an appointment

        $deadline = $start === null ? $limit : $limit->min($start->max(now()->addHour()));

        // The start is in parish time; the column is written in the app timezone.
        return \Carbon\CarbonImmutable::instance($deadline)->setTimezone(config('app.timezone'));
    }

    /** After a reschedule an open unpaid hold is never lengthened; it shortens to the new cap. */
    private function shortenOpenHold(Booking $b): void
    {
        if ($b->payment_status?->awaitingPayment() && $b->payment_hold_expires_at !== null) {
            $b->update(['payment_hold_expires_at' => $b->payment_hold_expires_at->min($this->holdDeadline($b))]);
        }
    }

    /** A deadline in parish time, e.g. "Oct 6, 7:46 AM". */
    private function deadlineText(\Carbon\CarbonInterface $at): string
    {
        return \Carbon\CarbonImmutable::instance($at)->setTimezone(config('app.parish_timezone', 'Asia/Manila'))->format('M j, g:i A');
    }

    private function requireTransition(Booking $b, S $to, string $verb): S
    {
        if (! $b->status->canTransitionTo($to)) {
            throw new BookingRuleViolation("This booking can't be {$verb} from its current state ({$b->status->label()}).");
        }

        return $b->status;
    }

    /** Serializes concurrent writers for one day (MySQL row locks; SQLite serializes writes). */
    private function lockDay(string $date): void
    {
        Booking::whereDate('appointment_date', $date)->lockForUpdate()->get(['id']);
    }

    private function locked(Booking $booking, \Closure $fn): mixed
    {
        return DB::transaction(function () use ($booking, $fn) {
            $fresh = Booking::lockForUpdate()->findOrFail($booking->id);

            return $fn($fresh);
        });
    }
}
