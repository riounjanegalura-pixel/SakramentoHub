<?php

namespace App\Services\Booking;

use App\Enums\BookingStatus as S;
use App\Enums\PaymentStatus as P;
use App\Models\Booking;
use App\Models\ParishSetting;
use Carbon\CarbonImmutable;

/**
 * Which reminders are worth sending at this moment (spec §8.2). Every window is read in parish time and is closed
 * by the event itself, so a scheduler that slept still sends what is useful and never what is too late. Whether a
 * reminder was already sent is the command's business (the sent_reminders ledger), not decided here.
 */
class ReminderWindows
{
    public const KINDS = ['appointment_week', 'appointment_tomorrow', 'payment_closing', 'returned_lapsing', 'wedding_step_overdue'];

    /** The payment reminder opens this many hours before the hold ends. */
    public const PAYMENT_HOURS = 12;

    /** The returned reminder opens this many days before the hold ends. */
    public const RETURNED_DAYS = 2;

    public function __construct(private BookingNotifier $notify, private WeddingMilestones $milestones) {}

    /**
     * @return iterable<array{booking: Booking, kind: string, subject: string, title: string, body: string,
     *     mailSubject: string, alsoStaff: ?string}> alsoStaff is the staff alert's text, or null for none
     */
    public function due(CarbonImmutable $parishNow): iterable
    {
        yield from $this->appointments($parishNow);
        yield from $this->payments($parishNow);
        yield from $this->returned($parishNow);
        yield from $this->weddingSteps($parishNow);
    }

    /** Timestamp columns hold the app timezone; a parish-time instant is converted before it is compared in SQL. */
    private function stored(CarbonImmutable $at): CarbonImmutable
    {
        return $at->setTimezone(config('app.timezone'));
    }

    private function appointments(CarbonImmutable $now): iterable
    {
        $today = $now->startOfDay();
        $bookings = Booking::where('status', S::Approved->value)
            ->whereNotNull('appointment_date')
            ->whereDate('appointment_date', '>=', $today->toDateString())
            ->whereDate('appointment_date', '<=', $today->addDays(7)->toDateString())
            ->with(['user', 'service'])
            ->get();

        foreach ($bookings as $b) {
            $start = $b->appointmentStartsAt();
            $date = $b->appointmentDateString();
            if ($start === null || $date === null) {
                continue;
            }
            $daysOut = (int) $today->diffInDays($start->startOfDay());
            $service = $this->notify->sacramentLabel($b);
            $when = $start->format('g:i A').' at '.ParishSetting::parishName();

            if ($daysOut >= 2 && $daysOut <= 7) {
                yield [
                    'booking' => $b, 'kind' => 'appointment_week', 'subject' => $date,
                    'title' => 'Appointment this week',
                    'body' => "Your {$service} ({$b->reference_number}) is on {$start->format('l, M j')} at {$when}.",
                    'mailSubject' => "Reminder: your {$service} on {$start->format('M j')} ({$b->reference_number})",
                    'alsoStaff' => null,
                ];
            }

            // Opens at 08:00 the day before and shuts at the start, so a late run says "today" and a later one says nothing.
            if ($now->gte($start->subDay()->setTime(8, 0)) && $now->lt($start)) {
                $day = $daysOut === 0 ? 'today' : 'tomorrow';
                yield [
                    'booking' => $b, 'kind' => 'appointment_tomorrow', 'subject' => $date,
                    'title' => 'Appointment tomorrow',
                    'body' => "Your {$service} ({$b->reference_number}) is {$day}, {$start->format('M j')} at {$when}. Show your day pass at the office.",
                    'mailSubject' => "Reminder: your {$service} is {$day} ({$b->reference_number})",
                    'alsoStaff' => null,
                ];
            }
        }
    }

    private function payments(CarbonImmutable $now): iterable
    {
        $bookings = Booking::where('status', S::Submitted->value)
            ->whereIn('payment_status', P::awaitingValues())
            ->where('payment_hold_expires_at', '>', $this->stored($now))
            ->where('payment_hold_expires_at', '<=', $this->stored($now->addHours(self::PAYMENT_HOURS)))
            ->with(['user', 'service'])
            ->get();

        foreach ($bookings as $b) {
            $closes = CarbonImmutable::instance($b->payment_hold_expires_at)->setTimezone($now->getTimezone());
            $day = match ($closes->toDateString()) {
                $now->toDateString() => 'today',
                $now->addDay()->toDateString() => 'tomorrow',
                default => 'on '.$closes->format('M j'),
            };

            yield [
                'booking' => $b, 'kind' => 'payment_closing', 'subject' => $closes->format('Y-m-d\TH:i'),
                'title' => 'Payment closing soon',
                'body' => "Your payment window for {$b->reference_number} closes at {$closes->format('g:i A')} {$day}. "
                    .($b->payment_status === P::PendingCash ? 'Bring the cash to the parish office before then to keep your slot.' : 'Pay by GCash to keep your slot.'),
                'mailSubject' => "Payment window closing ({$b->reference_number})",
                'alsoStaff' => null,
            ];
        }
    }

    private function returned(CarbonImmutable $now): iterable
    {
        $bookings = Booking::where('status', S::Returned->value)
            ->whereNotNull('returned_at')
            ->where('returned_at', '>', $this->stored($now->subDays(7)))
            ->with(['user', 'service'])
            ->get();

        foreach ($bookings as $b) {
            $returnedAt = CarbonImmutable::instance($b->returned_at)->setTimezone($now->getTimezone());
            $holdEnds = $returnedAt->addDays(7);
            $start = $b->appointmentStartsAt();
            if ($start !== null && $start->lt($holdEnds)) {
                $holdEnds = $start;
            }
            if ($holdEnds->lte($now) || $holdEnds->gt($now->addDays(self::RETURNED_DAYS))) {
                continue;
            }

            $service = $this->notify->sacramentLabel($b);
            yield [
                'booking' => $b, 'kind' => 'returned_lapsing', 'subject' => $returnedAt->format('Y-m-d\TH:i'),
                'title' => 'Booking will lapse soon',
                'body' => "Your {$service} ({$b->reference_number}) was sent back for changes. Update and resubmit it by {$holdEnds->format('M j, g:i A')} or your slot is released.",
                'mailSubject' => "Resubmit your booking soon ({$b->reference_number})",
                'alsoStaff' => null,
            ];
        }
    }

    /** One reminder per gating step that is overdue (a short-notice step that could never be met is only "due"). */
    private function weddingSteps(CarbonImmutable $now): iterable
    {
        $weddings = Booking::where('sacrament', 'wedding')
            ->whereIn('status', [S::Submitted->value, S::Approved->value])
            ->with(['user', 'service'])
            ->get();

        foreach ($weddings as $b) {
            foreach ($this->milestones->for($b) as $row) {
                if (! $row['gating'] || $row['state'] !== 'overdue') {
                    continue;
                }
                $due = CarbonImmutable::parse((string) $row['dueDate'])->format('M j');
                $service = $this->notify->sacramentLabel($b);

                yield [
                    'booking' => $b, 'kind' => 'wedding_step_overdue', 'subject' => "{$row['key']}|{$row['dueDate']}", // a step overdue again after a reschedule is a new reminder
                    'title' => 'Wedding step overdue',
                    'body' => "Your {$service} ({$b->reference_number}): {$row['label']} was due on {$due}. Please contact the parish office.",
                    'mailSubject' => "Wedding step overdue ({$b->reference_number})",
                    'alsoStaff' => "{$b->reference_number}: {$row['label']} was due on {$due}.",
                ];
            }
        }
    }
}
