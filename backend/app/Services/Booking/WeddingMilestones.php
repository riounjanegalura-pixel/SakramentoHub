<?php

namespace App\Services\Booking;

use App\Enums\BookingStatus as S;
use App\Enums\PaymentStatus as P;
use App\Exceptions\BookingRuleViolation;
use App\Models\AuditLog;
use App\Models\Booking;
use App\Models\BookingMilestone;
use App\Models\User;
use App\Support\ParishClock;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * A wedding's preparation checklist (spec §6). Most steps are worked out from the booking each time and never
 * stored; only what staff tick by hand is kept, in booking_milestones. The numbers below are the parish's own
 * practice and are the priest's to change.
 */
class WeddingMilestones
{
    /** Every step, in the order it is shown. The mixed marriage step is left out when both are Catholic. */
    public const LABELS = [
        'submitted' => 'Booking submitted',
        'paid' => 'Fee paid',
        'core_documents' => 'Core documents accepted',
        'canonical_interview' => 'Canonical interview',
        'banns_requested' => 'Banns requested',
        'mixed_marriage_permission' => 'Permission for a mixed marriage',
        'pre_cana' => 'Pre-Cana seminar',
        'banns_completed' => 'Banns completed or dispensed',
        'marriage_license' => 'Marriage license or Art. 34 affidavit',
        'confession' => 'Confession',
        'approved' => 'Booking approved',
        'wedding_day' => 'Wedding day',
        'civil_registry' => 'Marriage certificate sent to the Local Civil Registrar',
    ];

    /** Days before the wedding by which each step should be done. */
    public const DUE_DAYS_BEFORE = [
        'canonical_interview' => 60,
        'banns_requested' => 45,
        'mixed_marriage_permission' => 30,
        'pre_cana' => 30,
        'banns_completed' => 14,
        'marriage_license' => 14,
        'confession' => 3,
    ];

    /** The civil registry copy is due this many days after the wedding. */
    public const CIVIL_REGISTRY_DAYS_AFTER = 15;

    /** A wedding cannot be marked completed while one of these is open. Confession is recommended, never required. */
    public const GATING = ['core_documents', 'canonical_interview', 'mixed_marriage_permission', 'pre_cana', 'banns_completed', 'marriage_license'];

    /** The steps a staff member may tick by hand. */
    public const MANUAL = [
        'canonical_interview', 'banns_requested', 'mixed_marriage_permission', 'pre_cana',
        'banns_completed', 'marriage_license', 'confession', 'civil_registry',
    ];

    /** Steps an accepted document also completes. The license is not here: the file helps staff, the tick records the details. */
    public const DOCUMENT_FOR = [
        'pre_cana' => 'preCanaCertificate',
        'banns_completed' => 'bannsCertificate',
        'confession' => 'confessionCertificate',
    ];

    /** Documents that may be added after the booking is submitted, without sending it back to review. */
    public const LATE_KEYS = ['marriageLicense', 'preCanaCertificate', 'bannsCertificate', 'confessionCertificate'];

    /** A step is "due" from this many days before its date. */
    public const DUE_SOON_DAYS = 7;

    /** Family Code Art. 20: a marriage license is good for 120 days from the date of issue. */
    public const LICENSE_VALID_DAYS = 120;

    public function __construct(private BookingAudit $audit, private BookingNotifier $notify) {}

    /**
     * @return list<array{key: string, label: string, done: bool, state: string, source: ?string, dueDate: ?string,
     *     gating: bool, manual: bool, note: ?string, doneAt: ?string, data: ?array, doneBy: ?array}> empty unless a wedding
     */
    public function for(Booking $b): array
    {
        if ($b->sacrament !== 'wedding') {
            return [];
        }

        // A list endpoint eager-loads the ticks; a single booking reads them fresh (they may have just changed).
        $ticks = ($b->relationLoaded('milestoneTicks') ? $b->milestoneTicks : $b->milestoneTicks()->with('doneByUser')->get())->keyBy('key');
        $documents = collect($b->documentChecklist())->keyBy('key');
        $accepted = fn (array $doc) => ($doc['review']['status'] ?? null) === 'accepted';

        $automatic = [
            'submitted' => $b->status !== S::Draft,
            'paid' => in_array($b->payment_status, [P::Paid, P::NotRequired], true),
            'core_documents' => $documents->where('required', true)->every($accepted),
            'approved' => in_array($b->status, [S::Approved, S::Completed], true),
            'wedding_day' => $b->status === S::Completed,
        ];

        $today = ParishClock::todayString();
        // Read from the audit log only when a step is past its date, and then once for the whole checklist.
        $submittedOn = null;
        $firstSubmitted = function () use ($b, &$submittedOn) {
            return $submittedOn ??= $this->firstSubmittedOn($b);
        };
        $rows = [];
        foreach (self::LABELS as $key => $label) {
            if ($key === 'mixed_marriage_permission' && ! $this->needsMixedMarriagePermission($b)) {
                continue;
            }

            $tick = $ticks->get($key);
            $document = $documents->get(self::DOCUMENT_FOR[$key] ?? '');
            $source = match (true) {
                $automatic[$key] ?? false => 'auto',
                $tick !== null => 'staff',
                $document !== null && $accepted($document) => 'document',
                default => null,
            };
            $due = $this->dueDate($b, $key);

            $rows[] = [
                'key' => $key,
                'label' => $label,
                'done' => $source !== null,
                'state' => $source !== null ? 'done' : $this->openState($due, $today, $firstSubmitted),
                'source' => $source,
                'dueDate' => $due,
                'gating' => in_array($key, self::GATING, true),
                'manual' => in_array($key, self::MANUAL, true),
                'note' => $source === 'staff' ? $tick->note : null,
                'doneAt' => match ($source) {
                    'staff' => $tick->done_at?->toISOString(),
                    'document' => $document['review']['reviewedAt'],
                    'auto' => $key === 'paid' ? $b->paid_at?->toISOString() : null,
                    default => null,
                },
                'data' => $source === 'staff' ? $tick->data : null,
                'doneBy' => $source === 'staff' && $tick->done_by ? ['id' => $tick->done_by, 'fullName' => $tick->doneByUser?->full_name] : null,
            ];
        }

        return $rows;
    }

    /** @return list<string> labels of the steps that still block completion, in checklist order */
    public function openGatingLabels(Booking $b): array
    {
        return array_values(array_map(
            fn (array $row) => $row['label'],
            array_filter($this->for($b), fn (array $row) => $row['gating'] && ! $row['done']),
        ));
    }

    /** Only a religion that was filled in and is not Catholic asks for the permission; a blank answer does not. */
    public function needsMixedMarriagePermission(Booking $b): bool
    {
        foreach (['groomReligion', 'brideReligion'] as $field) {
            $religion = mb_strtolower(trim((string) preg_replace('/\s+/', ' ', (string) ($b->form_data[$field] ?? ''))));
            if ($religion !== '' && ! in_array($religion, ['catholic', 'roman catholic'], true)) {
                return true;
            }
        }

        return false;
    }

    /** The one place the 120-day arithmetic lives: a license covers a wedding from the day it was issued to day 120. */
    public function licenseCovers(string $issuedOn, string $weddingDate): bool
    {
        $issued = CarbonImmutable::parse($issuedOn);

        return $weddingDate >= $issued->toDateString() && $weddingDate <= $issued->addDays(self::LICENSE_VALID_DAYS)->toDateString();
    }

    /** Null when the license covers the wedding date; otherwise the sentence to show, naming the last day it covers. */
    public function licenseWindowError(Booking $b, string $issuedOn): ?string
    {
        $wedding = $b->appointmentDateString();

        if ($wedding === null || $this->licenseCovers($issuedOn, $wedding)) {
            return null;
        }

        $issued = CarbonImmutable::parse($issuedOn);

        return 'A marriage license is valid for '.self::LICENSE_VALID_DAYS." days: issued {$issued->format('F j, Y')}, it covers weddings until {$issued->addDays(self::LICENSE_VALID_DAYS)->format('F j, Y')}.";
    }

    /**
     * After a wedding moves: a ticked license that no longer covers the new date is taken off, audited and flagged to
     * staff. Runs inside the caller's transaction and never fails the move. An Art. 34 tick has no issue date and stays.
     */
    public function recheckLicense(Booking $b, User $actor): void
    {
        $date = $b->appointmentDateString();
        $tick = $b->sacrament === 'wedding' && $date !== null
            ? BookingMilestone::where('booking_id', $b->id)->where('key', 'marriage_license')->first()
            : null;
        $issuedOn = $tick?->data['issuedOn'] ?? null;
        if ($issuedOn === null || $this->licenseCovers($issuedOn, $date)) {
            return;
        }

        $tick->delete();
        $this->audit->record($actor, 'milestone.unticked', $b, [
            'key' => 'marriage_license', 'label' => self::LABELS['marriage_license'], 'note' => $tick->note, 'data' => $tick->data,
            'reason' => 'license no longer valid for the new date',
        ]);
        $this->notify->staff('License needs checking', "{$b->reference_number}: the wedding was moved to ".CarbonImmutable::parse($date)->format('F j, Y').'; the recorded marriage license (issued '.CarbonImmutable::parse($issuedOn)->format('F j, Y').') no longer covers it.', $b);
    }

    /** Refuses a tick or untick this booking cannot take right now. */
    public function guard(Booking $b, string $key): void
    {
        if (! in_array($key, self::MANUAL, true)) {
            throw new BookingRuleViolation('That step cannot be ticked by hand.');
        }
        if ($b->sacrament !== 'wedding') {
            throw new BookingRuleViolation('Only a wedding booking has preparation steps.');
        }
        if ($b->status === S::Completed) {
            // What happened before the wedding is on record with the register entry; only the step after it stays open.
            if ($key !== 'civil_registry') {
                throw new BookingRuleViolation('This wedding is completed. Only the civil registry step can still be updated.');
            }
        } elseif (! in_array($b->status, [S::Submitted, S::Approved], true)) {
            throw new BookingRuleViolation('Preparation steps can only be updated while the booking is submitted or approved.');
        } elseif ($key === 'civil_registry') {
            throw new BookingRuleViolation('The civil registry step opens once the wedding is completed.');
        }
        if ($key === 'mixed_marriage_permission' && ! $this->needsMixedMarriagePermission($b)) {
            throw new BookingRuleViolation('This couple does not need permission for a mixed marriage.');
        }
    }

    /** Records that a staff member vouches for a step. Under the booking lock, so it cannot cross a completion. */
    public function tick(Booking $booking, string $key, User $staff, ?string $note, ?array $data): Booking
    {
        return DB::transaction(function () use ($booking, $key, $staff, $note, $data) {
            $b = Booking::lockForUpdate()->findOrFail($booking->id);
            $this->guard($b, $key);

            // Against the wedding date as it is now, under the lock: a reschedule cannot slip in between check and tick.
            if ($key === 'marriage_license' && isset($data['issuedOn']) && ($error = $this->licenseWindowError($b, $data['issuedOn']))) {
                throw ValidationException::withMessages(['issuedOn' => [$error]]);
            }

            BookingMilestone::updateOrCreate(
                ['booking_id' => $b->id, 'key' => $key],
                ['done_at' => now(), 'done_by' => $staff->id, 'note' => $note, 'data' => $data],
            );
            $this->audit->record($staff, 'milestone.ticked', $b, ['key' => $key, 'label' => self::LABELS[$key], 'note' => $note, 'data' => $data]);

            return $b;
        });
    }

    /** Removes a tick. Any staff member may; the audit row keeps what the tick said. */
    public function untick(Booking $booking, string $key, User $staff): Booking
    {
        return DB::transaction(function () use ($booking, $key, $staff) {
            $b = Booking::lockForUpdate()->findOrFail($booking->id);
            $this->guard($b, $key);

            $tick = BookingMilestone::where('booking_id', $b->id)->where('key', $key)->first();
            if ($tick !== null) {
                $tick->delete();
                $this->audit->record($staff, 'milestone.unticked', $b, ['key' => $key, 'label' => self::LABELS[$key], 'note' => $tick->note, 'data' => $tick->data]);
            }

            return $b;
        });
    }

    private function dueDate(Booking $b, string $key): ?string
    {
        $wedding = $b->appointmentDateString();
        if ($wedding === null) {
            return null;
        }
        if ($key === 'civil_registry') {
            return CarbonImmutable::parse($wedding)->addDays(self::CIVIL_REGISTRY_DAYS_AFTER)->toDateString();
        }

        return isset(self::DUE_DAYS_BEFORE[$key]) ? CarbonImmutable::parse($wedding)->subDays(self::DUE_DAYS_BEFORE[$key])->toDateString() : null;
    }

    /**
     * A step past its date is overdue, unless that date had already passed when the couple first booked
     * (a short-notice wedding): they could never have met it, so it is only due.
     */
    private function openState(?string $due, string $today, \Closure $firstSubmitted): string
    {
        if ($due === null) {
            return 'upcoming';
        }
        if ($due < $today) {
            return $due >= $firstSubmitted() ? 'overdue' : 'due';
        }

        return $due <= CarbonImmutable::parse($today)->addDays(self::DUE_SOON_DAYS)->toDateString() ? 'due' : 'upcoming';
    }

    /** The parish date of the first submission (a resubmission after a return does not move it); the creation date for old rows with no audit. */
    private function firstSubmittedOn(Booking $b): string
    {
        return CarbonImmutable::instance(
            AuditLog::where('subject_type', 'booking')->where('subject_id', $b->id)->where('action', 'booking.submitted')
                ->orderBy('created_at')->value('created_at') ?? $b->created_at,
        )->setTimezone(config('app.parish_timezone', 'Asia/Manila'))->toDateString();
    }
}
