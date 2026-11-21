<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\BlackoutDate;
use App\Models\Booking;
use App\Models\ParishEvent;
use App\Models\ParishSetting;
use App\Models\Service;
use App\Services\Scheduling\LiturgicalCalendar;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

/** Everything that occupies the one priest, day by day. Reads the same holdingSlot() scope the scheduler enforces. */
class ScheduleController extends Controller
{
    private const ORDER = ['mass' => 0, 'session' => 1, 'booking' => 2];

    public function index(Request $request, LiturgicalCalendar $calendar)
    {
        $request->validate([
            'start' => ['required', 'date_format:Y-m-d'],
            'end' => ['required', 'date_format:Y-m-d', 'after_or_equal:start'],
        ]);
        $start = CarbonImmutable::parse($request->string('start')->toString());
        $end = CarbonImmutable::parse($request->string('end')->toString());
        if ($start->diffInDays($end) > 61) {
            return response()->json(['message' => 'The range may cover at most 62 days.'], 422);
        }

        $bookings = Booking::holdingSlot()->with('user')
            ->whereNotNull('appointment_start')
            ->whereDate('appointment_date', '>=', $start->toDateString())
            ->whereDate('appointment_date', '<=', $end->toDateString())
            ->get()->groupBy(fn (Booking $b) => $b->appointmentDateString());

        $masses = ParishEvent::where('category', 'mass')
            ->whereDate('date', '>=', $start->toDateString())->whereDate('date', '<=', $end->toDateString())
            ->get()->groupBy(fn ($m) => Carbon::parse($m->date)->toDateString());

        $sessionServices = Service::whereNotNull('session_times')->get();
        $names = Service::pluck('name', 'id');
        $blackouts = BlackoutDate::whereDate('date', '>=', $start->toDateString())->whereDate('date', '<=', $end->toDateString())
            ->orderBy('id')->get()->groupBy(fn (BlackoutDate $b) => $b->date->toDateString());

        $days = [];
        for ($day = $start; $day->lte($end); $day = $day->addDay()) {
            $date = $day->toDateString();
            $items = [];

            foreach ($masses->get($date, []) as $mass) {
                $at = Carbon::parse($mass->date);
                $items[] = ['type' => 'mass', 'title' => $mass->title, 'start' => $at->format('H:i'),
                    'end' => $at->copy()->addMinutes((int) ($mass->duration_minutes ?? 60))->format('H:i')];
            }

            $dayBookings = $bookings->get($date, collect());
            $sessionStarts = [];
            foreach ($sessionServices as $svc) {
                if (! in_array($day->dayOfWeekIso, array_map('intval', $svc->session_weekdays ?? []), true)) {
                    continue;
                }
                foreach ($svc->session_times as $time) {
                    $sessionStarts[$svc->id][] = $time;
                    $items[] = [
                        'type' => 'session', 'sacrament' => $svc->id, 'start' => $time,
                        'end' => $this->plus($time, (int) ($svc->session_duration_minutes ?? $svc->duration_minutes)),
                        'booked' => $dayBookings->where('sacrament', $svc->id)->where('appointment_start', $time)->count(),
                        'capacity' => (int) $svc->session_capacity,
                    ];
                }
            }

            foreach ($dayBookings as $b) {
                $items[] = [
                    'type' => 'booking', 'id' => $b->id, 'referenceNumber' => $b->reference_number, 'sacrament' => $b->sacrament,
                    'subjectName' => $b->subjectName(), 'start' => $b->appointment_start, 'end' => $b->appointment_end,
                    'status' => $b->status->value, 'paymentStatus' => $b->payment_status?->value,
                    'isOffsite' => (bool) $b->is_offsite, 'channel' => $b->channel ?? 'online',
                    'inSession' => in_array($b->appointment_start, $sessionStarts[$b->sacrament] ?? [], true),
                    'checkedInAt' => $b->checked_in_at?->toISOString(),
                    // Who to ring and where to go: the day sheet and the Dashboard's Call button read these.
                    'contactName' => $b->ownerName(), 'contactRelationship' => data_get($b->owner_snapshot, 'relationship'),
                    'contactPhone' => $b->contactPhone(),
                    'location' => $b->is_offsite ? $this->offsiteAddress($b) : null,
                ];
            }

            usort($items, fn ($a, $b) => [$a['start'], self::ORDER[$a['type']]] <=> [$b['start'], self::ORDER[$b['type']]]);
            $days[] = ['date' => $date, 'blackouts' => $calendar->notesFor($date, $names, $blackouts->get($date, [])), 'items' => $items];
        }

        $unscheduled = Booking::with('user')->where('is_emergency', true)
            ->whereIn('status', ['submitted', 'returned', 'approved'])->orderBy('created_at')->get()
            ->map(fn (Booking $b) => [
                'id' => $b->id, 'referenceNumber' => $b->reference_number, 'subjectName' => $b->subjectName(),
                'contactPhone' => $b->contactPhone(), 'status' => $b->status->value, 'createdAt' => $b->created_at->toISOString(),
            ])->values();

        return response()->json(['travelBufferMinutes' => ParishSetting::travelBufferMinutes(), 'days' => $days, 'unscheduled' => $unscheduled]);
    }

    private function plus(string $time, int $minutes): string
    {
        [$h, $m] = array_map('intval', explode(':', $time));
        $total = $h * 60 + $m + $minutes;

        return sprintf('%02d:%02d', intdiv($total, 60), $total % 60);
    }

    /** The off-site address, whichever field this sacrament's form keeps it in. */
    private function offsiteAddress(Booking $b): ?string
    {
        foreach (['venueAddress', 'patientAddress', 'propertyAddress', 'houseMassAddress', 'address'] as $key) {
            $v = trim((string) data_get($b->form_data, $key, ''));
            if ($v !== '') {
                return $v;
            }
        }

        return null;
    }
}
