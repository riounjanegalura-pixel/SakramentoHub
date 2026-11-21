<?php

namespace App\Models;

use App\Casts\AsPlainObjectJson;
use App\Enums\BookingStatus;
use App\Enums\PaymentStatus;
use App\Services\Scheduling\AppointmentRequest;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

class Booking extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'user_id', 'owner_snapshot', 'sacrament', 'status', 'form_data', 'reference_number',
        'payment_status', 'amount_due_centavos', 'paymongo_checkout_session_id', 'paymongo_payment_id',
        'paid_at', 'appointment_date', 'appointment_start', 'appointment_end', 'is_offsite',
        'is_emergency', 'payment_hold_expires_at', 'returned_at', 'status_reason', 'return_note',
        'refund_reference', 'refunded_at', 'channel', 'created_by', 'amount_paid_centavos', 'amount_refunded_centavos',
        'checked_in_at', 'checked_in_by', 'payment_method', 'cash_receipt_reference',
    ];

    /** Time-sensitive sacraments that jump the admin priority queue. */
    public const PRIORITY_SACRAMENTS = ['funeral', 'anointing'];

    protected function casts(): array
    {
        return [
            'form_data' => AsPlainObjectJson::class,
            'owner_snapshot' => 'array',
            'status' => BookingStatus::class,
            'payment_status' => PaymentStatus::class,
            'amount_due_centavos' => 'integer',
            'amount_paid_centavos' => 'integer',
            'amount_refunded_centavos' => 'integer',
            'paid_at' => 'datetime',
            // appointment_date is deliberately NOT cast: a `date` cast writes
            // "Y-m-d 00:00:00" on SQLite, which breaks equality lookups. It is
            // always written as a plain Y-m-d string and compared with whereDate().
            'is_offsite' => 'boolean',
            'is_emergency' => 'boolean',
            'payment_hold_expires_at' => 'datetime',
            'returned_at' => 'datetime',
            'refunded_at' => 'datetime',
            'checked_in_at' => 'datetime',
        ];
    }

    public function appointmentDateString(): ?string
    {
        return $this->appointment_date ? substr((string) $this->appointment_date, 0, 10) : null;
    }

    /** The appointment's start as an instant (date and start read in the parish timezone); null without an appointment. */
    public function appointmentStartsAt(): ?CarbonImmutable
    {
        $date = $this->appointmentDateString();
        if ($date === null || $this->appointment_start === null) {
            return null;
        }

        return CarbonImmutable::parse($date.' '.substr((string) $this->appointment_start, 0, 5), config('app.parish_timezone', 'Asia/Manila'));
    }

    /**
     * Bookings that currently block their time: a slot-holding status, and
     * not an unpaid (or pending_cash) booking past its 48 h hold, and not a returned booking
     * past its 7-day hold. Correctness never depends on the expiry job
     * having run — expired holds stop counting the moment they expire.
     */
    public function scopeHoldingSlot($query)
    {
        $now = now();

        return $query
            ->whereIn('status', ['submitted', 'returned', 'approved', 'completed'])
            ->where(fn ($q) => $q->whereNotIn('payment_status', PaymentStatus::awaitingValues())
                ->orWhereNull('payment_status')
                ->orWhereNull('payment_hold_expires_at')
                ->orWhere('payment_hold_expires_at', '>', $now))
            ->where(fn ($q) => $q->where('status', '!=', 'returned')
                ->orWhere('returned_at', '>', $now->copy()->subDays(7)));
    }

    /**
     * Bookings that belong to a parish date range: by appointment date, or,
     * for a booking with no slot (an urgent anointing), by the Manila date it
     * was requested. Drafts never count.
     */
    public function scopeInReportRange($query, string $from, string $to)
    {
        $tz = config('app.parish_timezone');
        $startUtc = \Carbon\CarbonImmutable::parse($from, $tz)->startOfDay()->utc();
        $endUtc = \Carbon\CarbonImmutable::parse($to, $tz)->endOfDay()->utc();

        return $query->where('status', '!=', BookingStatus::Draft->value)
            ->where(fn ($q) => $q
                ->where(fn ($d) => $d->whereNotNull('appointment_date')->whereDate('appointment_date', '>=', $from)->whereDate('appointment_date', '<=', $to))
                ->orWhere(fn ($d) => $d->whereNull('appointment_date')->whereBetween('created_at', [$startUtc, $endUtc])));
    }

    /** A walk-in the office is still drafting is the desk's, not the linked parishioner's, until staff submit it. */
    public function scopeVisibleToOwner($query)
    {
        return $query->where(fn ($q) => $q->where('channel', '!=', 'walk_in')->orWhereNull('channel')->orWhere('status', '!=', 'draft'));
    }

    /**
     * The booking owner's name/email, valid whether or not the account still
     * exists — falls back to the snapshot written by AccountController::destroy
     * once user_id has gone null. Every place that previously reached straight
     * for $booking->user->full_name (certificates, admin resources) should
     * read through here instead, so a deleted account can't 500 them.
     */
    /** Memo of heldSlot(): false = not looked up yet. */
    private array|null|false $heldSlotMemo = false;

    /**
     * The slot a returned booking still holds: the date and start it had when
     * staff returned it. Read from the audit row written at that moment, so a
     * later PATCH that moves the slot does not count as "held". Null for any
     * other status.
     *
     * @return array{date: string, start: string}|null
     */
    public function heldSlot(): ?array
    {
        if ($this->status !== BookingStatus::Returned
            || $this->returned_at === null
            || $this->returned_at->lte(now()->subDays(7))) {
            return null; // not returned, or the 7-day hold has lapsed
        }

        if ($this->heldSlotMemo !== false) {
            return $this->heldSlotUnlessStarted($this->heldSlotMemo);
        }

        $meta = AuditLog::where('subject_type', 'booking')
            ->where('subject_id', $this->id)
            ->where('action', 'booking.returned')
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->first()?->metadata;

        $date = $meta['appointmentDate'] ?? null;
        $start = $meta['appointmentStart'] ?? null;

        $this->heldSlotMemo = is_string($date) && is_string($start) ? ['date' => $date, 'start' => $start] : null;

        return $this->heldSlotUnlessStarted($this->heldSlotMemo);
    }

    /** A slot whose start has passed holds nothing: nobody can book it any more. */
    private function heldSlotUnlessStarted(?array $slot): ?array
    {
        if ($slot === null) {
            return null;
        }
        $starts = CarbonImmutable::parse($slot['date'].' '.substr($slot['start'], 0, 5), config('app.parish_timezone', 'Asia/Manila'));

        return $starts->lte(now()) ? null : $slot;
    }

    public function refresh()
    {
        $this->heldSlotMemo = false;

        return parent::refresh();
    }

    /** True while a returned booking still sits on the exact slot it was returned with. */
    public function holdsItsReturnedSlot(): bool
    {
        $held = $this->heldSlot();

        return $held !== null
            && $held['date'] === $this->appointmentDateString()
            && $held['start'] === $this->appointment_start;
    }

    public function ownerName(): ?string
    {
        return $this->user?->full_name ?? data_get($this->owner_snapshot, 'fullName');
    }

    public function ownerEmail(): ?string
    {
        return $this->user?->email ?? data_get($this->owner_snapshot, 'email');
    }

    /**
     * Every booking gets a short, human-readable reference number the moment
     * it's created — the UUID primary key is a fine database key but nobody
     * can read it over the phone or type it into the admin search box (item
     * 16). This is set here, once, rather than left to every caller to
     * remember — `reference_number` is fillable, but nothing outside tests
     * should ever set it directly.
     */
    protected static function booted(): void
    {
        static::creating(function (Booking $booking) {
            if (! $booking->reference_number) {
                $booking->reference_number = static::generateReferenceNumber($booking->sacrament);
            }
        });
    }

    /**
     * `{SACRAMENT}-{YYYYMMDD}-{4 random chars}`, e.g. "BAPT-20260905-K3F9" —
     * sacrament and creation date make it meaningful at a glance, the random
     * suffix (retried against a uniqueness check, not just trusted) makes
     * collisions vanishingly unlikely without needing a locked/sequential
     * counter. `$date` is passed explicitly (rather than always `now()`) so
     * the backfill migration can generate a value that matches each existing
     * row's real `created_at` instead of the migration's own run time.
     */
    public static function generateReferenceNumber(string $sacrament, $date = null): string
    {
        // The parish date (Manila), so a booking made early in the morning carries today's date.
        $date = $date ? \Illuminate\Support\Carbon::parse($date)->setTimezone(config('app.parish_timezone', 'Asia/Manila')) : \App\Support\ParishClock::now();
        $prefix = strtoupper(substr(preg_replace('/[^a-z]/i', '', $sacrament), 0, 4));

        do {
            $candidate = sprintf('%s-%s-%s', $prefix, $date->format('Ymd'), strtoupper(Str::random(4)));
        } while (static::where('reference_number', $candidate)->exists());

        return $candidate;
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /** The staff member who checked the booking in on the appointment day. */
    public function checkedInByUser()
    {
        return $this->belongsTo(User::class, 'checked_in_by');
    }

    public function documentReviews()
    {
        return $this->hasMany(BookingDocumentReview::class);
    }

    /** The wedding preparation steps staff ticked by hand (WeddingMilestones works out the rest). */
    public function milestoneTicks()
    {
        return $this->hasMany(BookingMilestone::class);
    }

    /**
     * The documents this booking asks for or holds, each with the staff review
     * of the file currently attached. A review made on an earlier file does
     * not count: replacing the file puts the document back to "not reviewed".
     *
     * @return list<array{key: string, label: string, required: bool, url: ?string, review: ?array}>
     */
    public function documentChecklist(): array
    {
        $data = (array) ($this->form_data ?? []);
        // A list endpoint eager-loads documentReviews.reviewer; reuse it instead of querying per booking.
        $reviews = ($this->relationLoaded('documentReviews') ? $this->documentReviews : $this->documentReviews()->with('reviewer')->get())->keyBy('document_key');
        $list = [];

        foreach (\App\Validation\SacramentDocuments::for($this->sacrament, $data) as $doc) {
            $url = isset($data[$doc['key']]) && is_string($data[$doc['key']]) && $data[$doc['key']] !== '' ? $data[$doc['key']] : null;
            if (! $doc['required'] && $url === null) {
                continue;
            }
            $review = $reviews->get($doc['key']);
            $list[] = $doc + [
                'url' => $url,
                'review' => $review && $url !== null && $review->file_url === $url ? [
                    'status' => $review->status,
                    'note' => $review->note,
                    'reviewedBy' => $review->reviewer?->full_name,
                    'reviewedAt' => $review->updated_at?->toISOString(),
                ] : null,
            ];
        }

        return $list;
    }

    /** A wedding's later documents (license, Pre-Cana, banns, confession) arrive after approval and never gate it; their steps gate completion. */
    public function documentsCleared(): bool
    {
        foreach ($this->documentChecklist() as $doc) {
            if ($this->sacrament === 'wedding' && in_array($doc['key'], \App\Services\Booking\WeddingMilestones::LATE_KEYS, true)) {
                continue;
            }
            if ($doc['url'] !== null && ($doc['review']['status'] ?? null) !== 'accepted') {
                return false;
            }
        }

        return true;
    }

    /** @return list<string> */
    public function rejectedDocumentLabels(): array
    {
        return array_values(array_map(
            fn ($d) => $d['label'],
            array_filter($this->documentChecklist(), fn ($d) => ($d['review']['status'] ?? null) === 'rejected'),
        ));
    }

    public function notes()
    {
        return $this->hasMany(BookingNote::class);
    }

    public function contactPhone(): ?string
    {
        return $this->user?->phone ?: data_get($this->owner_snapshot, 'phone');
    }

    /** The person (or property owner) this booking is for — schedule, queue, reports and certificates all read it here. */
    public function subjectName(): string
    {
        $d = (array) ($this->form_data ?? []);
        $name = fn (string $p) => trim(implode(' ', array_filter([
            $d["{$p}FirstName"] ?? null, $d["{$p}MiddleName"] ?? null, $d["{$p}LastName"] ?? null, $d["{$p}Suffix"] ?? null,
        ])));

        $subject = match ($this->sacrament) {
            'baptism' => $name('child'),
            'confirmation' => $name('confirmand'),
            'wedding' => trim($name('groom').' & '.$name('bride'), ' &'),
            'funeral' => $name('deceased'),
            'anointing' => $name('patient'),
            'house-blessing' => (string) ($d['propertyOwner'] ?? ''),
            default => '',
        };

        return $subject !== '' ? $subject : ($this->ownerName() ?? 'N/A');
    }

    /** Money held beyond the fee: only meaningful while the booking is paid. */
    public function overpaidCentavos(): int
    {
        if ($this->payment_status !== PaymentStatus::Paid || $this->amount_paid_centavos === null) {
            return 0;
        }

        return max(0, $this->amount_paid_centavos - $this->amount_refunded_centavos - (int) $this->amount_due_centavos);
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    /**
     * `sacrament` is a real foreign key onto `services.id` (see the
     * 2026_09_05_060000 migration) — this exposes the relationship the
     * ORM/schema way rather than callers hand-rolling
     * `Service::find($booking->sacrament)`.
     */
    public function registerEntry()
    {
        return $this->hasOne(RegisterEntry::class);
    }

    public function service()
    {
        return $this->belongsTo(Service::class, 'sacrament');
    }

    /** Server-side fee (spec §5.2) — the only place a booking's price is computed. */
    /**
     * Whether the owner can pay this booking online right now. With approval-before-payment that is only after the office
     * approved it and while its payment window is open; otherwise while it waits for review (or was returned for changes).
     */
    public function ownerCanPayNow(): bool
    {
        if (! $this->payment_status?->awaitingPayment()) {
            return false;
        }

        if (config('paymongo.approval_before_payment')) {
            return $this->status === BookingStatus::Approved && (bool) $this->payment_hold_expires_at?->isFuture();
        }

        return in_array($this->status, [BookingStatus::Submitted, BookingStatus::Returned], true)
            && ($this->status === BookingStatus::Returned || (bool) $this->payment_hold_expires_at?->isFuture());
    }

    /** The fee the parish set for this booking (flat, or per sponsor), whatever is actually charged. */
    public function realFeeCentavos(): int
    {
        $service = $this->service;
        if ($service === null || $service->price_centavos === null) {
            return 0;
        }

        return match ($service->fee_rule) {
            'per_sponsor' => (int) $service->price_centavos * count($this->form_data['sponsors'] ?? []),
            'flat' => (int) $service->price_centavos,
            default => 0,
        };
    }

    public function computeAmountDue(): int
    {
        $amount = $this->realFeeCentavos();

        // Testing switch (config/paymongo.php): a fee-bearing booking is CHARGED ₱1.00; a free one stays free.
        return $amount > 0 && config('paymongo.one_peso_test_prices') ? 100 : $amount;
    }

    /** What the screens show as the fee. With the ₱1 switch on it is the real fee, though ₱1.00 is what is charged. */
    public function displayAmountDueCentavos(bool $editable): ?int
    {
        $charged = $editable ? $this->computeAmountDue() : $this->amount_due_centavos;
        if (! config('paymongo.one_peso_test_prices') || ! $charged) {
            return $charged;
        }

        return $this->realFeeCentavos() ?: $charged;
    }

    public function appointmentRequest(?string $date = null, ?string $start = null): AppointmentRequest
    {
        return AppointmentRequest::make(
            $this->service,
            $date ?? (string) $this->appointmentDateString(),
            $start ?? $this->appointment_start,
            (array) ($this->form_data ?? []),
        );
    }
}
