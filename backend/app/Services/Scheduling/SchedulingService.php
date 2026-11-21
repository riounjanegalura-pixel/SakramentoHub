<?php
// backend/app/Services/Scheduling/SchedulingService.php

namespace App\Services\Scheduling;

use App\Models\Booking;
use App\Models\ParishEvent;
use App\Models\ParishSetting;
use App\Models\Service;
use App\Support\ParishClock;
use Carbon\CarbonImmutable;
use Illuminate\Support\Carbon;

class SchedulingService
{
    /** @var array<string, Service> */
    private array $services = [];

    public function __construct(private LiturgicalCalendar $calendar) {}

    /**
     * Lead time and the same-day "an hour from now" cutoff are booking-time
     * rules: they apply when a slot is first taken. Pass $bookingTime = false
     * for the office's lead-time waiver (walk-ins): every other rule still
     * applies. A slot a booking already holds is not re-checked here at all
     * (see heldSlotConflict).
     */
    public function dayRuleViolation(AppointmentRequest $r, bool $bookingTime = true): ?string
    {
        $service = $this->service($r);
        $today = ParishClock::today();
        $day = CarbonImmutable::parse($r->date, config('app.parish_timezone'))->startOfDay();

        if ($day->lt($today)) {
            return 'That date has already passed.';
        }
        if ($bookingTime && $day->lt($today->addDays($service->lead_time_days))) {
            return "{$service->name} must be booked at least {$service->lead_time_days} days ahead.";
        }

        $weekdays = $r->session ? ($service->session_weekdays ?? []) : ($service->allowed_weekdays ?? []);
        if (! in_array($day->dayOfWeekIso, array_map('intval', $weekdays), true)) {
            return "{$service->name} is not scheduled on {$day->format('l')}s.";
        }

        if ($reason = $this->calendar->blackoutReason($r->date, $r->sacrament)) {
            return "Unavailable: {$reason}.";
        }

        return null;
    }

    /** @return list<string> */
    public function freeStarts(AppointmentRequest $r, ?string $excludeBookingId = null, bool $bookingTime = true): array
    {
        if ($this->dayRuleViolation($r, $bookingTime) !== null) {
            return [];
        }

        $service = $this->service($r);

        return $r->session
            ? $this->freeSessionStarts($service, $r, $excludeBookingId, $bookingTime)
            : $this->freeSlotStarts($service, $r, $excludeBookingId, $bookingTime);
    }

    public function check(AppointmentRequest $r, ?string $excludeBookingId = null, bool $bookingTime = true): ?string
    {
        if ($violation = $this->dayRuleViolation($r, $bookingTime)) {
            return $violation;
        }
        if ($r->start === null) {
            return 'Choose a start time.';
        }
        if ($r->session && ! $this->sessionInsideHours($r->start, $this->service($r))) {
            [$open, $close] = ParishSetting::workingHours();

            return "{$this->service($r)->name} sessions must fall within working hours ({$open}–{$close}).";
        }

        return in_array($r->start, $this->freeStarts($r, $excludeBookingId, $bookingTime), true)
            ? null
            : 'That time is no longer available. Please choose another.';
    }

    /**
     * A slot the booking already holds is re-checked for hard conflicts only
     * (approve, a returned booking resubmitted on its held slot, the
     * availability calendar). Slot step, working hours, weekdays and session
     * times are today's rules for new bookings: changing them never strands one.
     */
    public function heldSlotConflict(AppointmentRequest $r, string $bookingId): ?string
    {
        $service = $this->service($r);
        $day = CarbonImmutable::parse($r->date, config('app.parish_timezone'))->startOfDay();

        if ($day->lt(ParishClock::today())) {
            return 'That date has already passed.';
        }
        if ($reason = $this->calendar->blackoutReason($r->date, $r->sacrament)) {
            return "Unavailable: {$reason}.";
        }
        if ($r->start === null) {
            return 'Choose a start time.';
        }

        $gone = 'That time is no longer available. Please choose another.';
        $start = $this->toMinutes($r->start);
        if ($start < $this->earliestStartMinutes($r->date, false)) {
            return $gone;
        }
        if ($r->session ? $this->sessionRemaining($service, $r->date, $r->start, $bookingId) === 0 : $this->dailyCapacityReached($service, $r->date, $bookingId)) {
            return $gone;
        }

        $buffer = $r->offsite ? ParishSetting::travelBufferMinutes() : 0;
        $end = $this->toMinutes($this->endFor($r));
        foreach ($this->blockedIntervals($r->date, $bookingId, $r->session ? $r : null) as [$bs, $be]) {
            if ($start - $buffer < $be && $bs < $end + $buffer) {
                return $gone;
            }
        }

        return null;
    }

    public function endFor(AppointmentRequest $r): string
    {
        $service = $this->service($r);
        $minutes = $r->session
            ? ($service->session_duration_minutes ?? $service->duration_minutes)
            : $service->duration_minutes;

        return $this->toTime($this->toMinutes((string) $r->start) + $minutes);
    }

    /**
     * $own is the caller's own booking being edited: it never blocks its own
     * slot, and the start a returned booking still holds stays selectable on
     * its date even once lead time or the same-day cutoff has passed — the
     * same exemption submit applies (see BookingStateMachine::submit).
     *
     * @return array{date: string, status: string, reason: ?string, freeStarts: list<string>}
     */
    /** $bookingTime = false is the office's lead-time waiver (walk-ins); every other rule still applies. */
    public function dayStatus(AppointmentRequest $r, ?Booking $own = null, bool $bookingTime = true): array
    {
        $heldStart = $this->heldStartOn($r, $own);

        if (($reason = $this->dayRuleViolation($r, $bookingTime)) && $heldStart === null) {
            return ['date' => $r->date, 'status' => 'unavailable', 'reason' => $reason, 'freeStarts' => []];
        }

        $service = $this->service($r);
        $free = $this->freeStarts($r, $own?->id, $bookingTime);
        if ($heldStart !== null && ! in_array($heldStart, $free, true)) {
            $free[] = $heldStart;
            sort($free);
        }

        if ($r->session) {
            $times = $service->session_times ?? [];
            $capacity = (int) $service->session_capacity * count($times);
            $remaining = array_sum(array_map(fn (string $t) => $this->sessionRemaining($service, $r->date, $t, $own?->id), $times));
            $status = $remaining === 0 ? 'full' : ($remaining < $capacity ? 'limited' : 'free');
        } else {
            $possible = count($this->possibleSlotStarts($service, $r, $bookingTime));
            $status = count($free) === 0 ? 'full' : (count($free) < $possible ? 'limited' : 'free');
        }

        return ['date' => $r->date, 'status' => $status, 'reason' => null, 'freeStarts' => $free];
    }

    /** The start $own still holds on this request's date, unless a hard conflict now blocks it. */
    private function heldStartOn(AppointmentRequest $r, ?Booking $own): ?string
    {
        $held = $own?->heldSlot();
        if ($held === null || $held['date'] !== $r->date || $own->sacrament !== $r->sacrament) {
            return null;
        }

        return $this->heldSlotConflict($r->withStart($held['start']), $own->id) === null ? $held['start'] : null;
    }

    public function sessionRemaining(Service $service, string $date, string $time, ?string $excludeBookingId = null): int
    {
        $held = Booking::holdingSlot()
            ->where('sacrament', $service->id)
            ->whereDate('appointment_date', $date)
            ->where('appointment_start', $time)
            ->when($excludeBookingId, fn ($q) => $q->whereKeyNot($excludeBookingId))
            ->count();

        return max(0, (int) $service->session_capacity - $held);
    }

    /** A session starts and ends inside working hours (the same rule the settings screen enforces). */
    private function sessionInsideHours(string $time, Service $service): bool
    {
        [$open, $close] = ParishSetting::workingHours();
        $start = $this->toMinutes($time);

        return $start >= $this->toMinutes($open)
            && $start + ($service->session_duration_minutes ?? $service->duration_minutes) <= $this->toMinutes($close);
    }

    /** @return list<string> */
    private function freeSessionStarts(Service $service, AppointmentRequest $r, ?string $exclude, bool $bookingTime = true): array
    {
        $earliest = $this->earliestStartMinutes($r->date, $bookingTime);

        return array_values(array_filter(
            $service->session_times ?? [],
            fn (string $t) => $this->toMinutes($t) >= $earliest && $this->sessionInsideHours($t, $service) && $this->sessionRemaining($service, $r->date, $t, $exclude) > 0,
        ));
    }

    /** @return list<string> */
    private function freeSlotStarts(Service $service, AppointmentRequest $r, ?string $exclude, bool $bookingTime = true): array
    {
        if ($this->dailyCapacityReached($service, $r->date, $exclude)) {
            return [];
        }

        $buffer = $r->offsite ? ParishSetting::travelBufferMinutes() : 0;
        $blocked = $this->blockedIntervals($r->date, $exclude);

        return array_values(array_filter(
            $this->possibleSlotStarts($service, $r, $bookingTime),
            function (string $start) use ($service, $buffer, $blocked) {
                $s = $this->toMinutes($start) - $buffer;
                $e = $this->toMinutes($start) + $service->duration_minutes + $buffer;
                foreach ($blocked as [$bs, $be]) {
                    if ($s < $be && $bs < $e) {
                        return false;
                    }
                }

                return true;
            },
        ));
    }

    private function dailyCapacityReached(Service $service, string $date, ?string $exclude): bool
    {
        if ($service->daily_capacity === null) {
            return false;
        }

        return Booking::holdingSlot()
            ->where('sacrament', $service->id)
            ->whereDate('appointment_date', $date)
            ->when($exclude, fn ($q) => $q->whereKeyNot($exclude))
            ->count() >= $service->daily_capacity;
    }

    /** Every start inside working hours, ignoring other bookings. @return list<string> */
    private function possibleSlotStarts(Service $service, AppointmentRequest $r, bool $bookingTime = true): array
    {
        [$open, $close] = ParishSetting::workingHours();
        $step = ParishSetting::slotStepMinutes();
        $earliest = max($this->toMinutes($open), $this->earliestStartMinutes($r->date, $bookingTime));

        [$lunchOpen, $lunchClose] = ParishSetting::lunchBreak();
        $lunchStart = $this->toMinutes($lunchOpen);
        $lunchEnd = $this->toMinutes($lunchClose);

        $starts = [];
        for ($m = $this->toMinutes($open); $m + $service->duration_minutes <= $this->toMinutes($close); $m += $step) {
            // A visit may not start in, or run through, the lunch break.
            $overlapsLunch = $lunchStart < $lunchEnd && $m < $lunchEnd && $lunchStart < $m + $service->duration_minutes;
            if ($m >= $earliest && ! $overlapsLunch) {
                $starts[] = $this->toTime($m);
            }
        }

        return $starts;
    }

    /** For today: an hour from now when booking, right now for a slot already held. Any other day: midnight. */
    private function earliestStartMinutes(string $date, bool $bookingTime = true): int
    {
        if ($date !== ParishClock::todayString()) {
            return 0;
        }
        $now = ParishClock::now();

        return $now->hour * 60 + $now->minute + ($bookingTime ? 60 : 0);
    }

    /**
     * Minutes-from-midnight intervals when the priest is already committed.
     * $session is a session request being re-checked: its own session shares
     * the priest, so same-sacrament bookings at its start and the service's
     * own session blocks are not conflicts.
     *
     * @return list<array{0:int,1:int}>
     */
    private function blockedIntervals(string $date, ?string $exclude, ?AppointmentRequest $session = null): array
    {
        $travel = ParishSetting::travelBufferMinutes();
        $intervals = [];

        $bookings = Booking::holdingSlot()
            ->whereDate('appointment_date', $date)
            ->whereNotNull('appointment_start')
            ->when($exclude, fn ($q) => $q->whereKeyNot($exclude))
            ->when($session, fn ($q) => $q->whereNot(fn ($same) => $same->where('sacrament', $session->sacrament)->where('appointment_start', $session->start)))
            ->get(['id', 'appointment_start', 'appointment_end', 'is_offsite']);

        foreach ($bookings as $b) {
            $pad = $b->is_offsite ? $travel : 0;
            $intervals[] = [$this->toMinutes($b->appointment_start) - $pad, $this->toMinutes($b->appointment_end) + $pad];
        }

        $weekday = CarbonImmutable::parse($date)->dayOfWeekIso;
        foreach (Service::whereNotNull('session_times')->get() as $svc) {
            if ($svc->id === $session?->sacrament) {
                continue;
            }
            if (in_array($weekday, array_map('intval', $svc->session_weekdays ?? []), true)) {
                foreach ($svc->session_times as $t) {
                    $start = $this->toMinutes($t);
                    $intervals[] = [$start, $start + ($svc->session_duration_minutes ?? $svc->duration_minutes)];
                }
            }
        }

        // Parish event timestamps are entered as parish wall-clock time.
        foreach (ParishEvent::where('category', 'mass')->whereDate('date', $date)->get() as $mass) {
            $at = Carbon::parse($mass->date);
            $start = $at->hour * 60 + $at->minute;
            $intervals[] = [$start, $start + (int) ($mass->duration_minutes ?? 60)];
        }

        return $intervals;
    }

    private function service(AppointmentRequest $r): Service
    {
        return $this->services[$r->sacrament] ??= Service::findOrFail($r->sacrament);
    }

    private function toMinutes(string $time): int
    {
        [$h, $m] = array_map('intval', explode(':', $time));

        return $h * 60 + $m;
    }

    private function toTime(int $minutes): string
    {
        return sprintf('%02d:%02d', intdiv($minutes, 60), $minutes % 60);
    }
}
