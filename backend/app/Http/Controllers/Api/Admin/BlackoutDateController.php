<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\BlackoutDate;
use App\Models\Booking;
use App\Services\AuditTrail;
use App\Support\ParishClock;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class BlackoutDateController extends Controller
{
    public function index()
    {
        return response()->json(
            BlackoutDate::whereDate('date', '>=', ParishClock::todayString())->orderBy('date')->orderBy('id')->get()->map($this->shape(...))->values(),
        );
    }

    public function store(Request $request, AuditTrail $audit)
    {
        $request->validate([
            'date' => ['required', 'date_format:Y-m-d'],
            'endDate' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:date'],
            'reason' => ['required', 'string', 'min:3', 'max:120'],
            // Optional time window. Both or neither; with neither the whole day is closed.
            'startTime' => ['nullable', 'date_format:H:i', 'required_with:endTime'],
            'endTime' => ['nullable', 'date_format:H:i', 'required_with:startTime', 'after:startTime'],
            'sacraments' => ['nullable', 'array', 'min:1'],
            'sacraments.*' => ['string', 'distinct', Rule::exists('services', 'id')],
        ]);

        $start = CarbonImmutable::parse($request->string('date')->toString());
        $end = CarbonImmutable::parse($request->input('endDate') ?? $start->toDateString());
        if ($start->diffInDays($end) > 30) {
            throw ValidationException::withMessages(['endDate' => 'A closure may cover at most 31 days.']);
        }

        $reason = trim($request->string('reason')->toString());
        $sacraments = $request->input('sacraments');
        $startTime = $request->input('startTime');
        $endTime = $request->input('endTime');
        $created = [];
        $dates = [];
        for ($day = $start; $day->lte($end); $day = $day->addDay()) {
            $dates[] = $date = $day->toDateString();
            $exists = BlackoutDate::whereDate('date', $date)->where('reason', $reason)->get()
                ->contains(fn (BlackoutDate $b) => $b->sacraments == $sacraments && $b->start_time === $startTime && $b->end_time === $endTime);
            if (! $exists) {
                $created[] = BlackoutDate::create(['date' => $date, 'reason' => $reason, 'start_time' => $startTime, 'end_time' => $endTime, 'sacraments' => $sacraments]);
            }
        }

        if ($created !== []) {
            $audit->record($request->user(), 'blackout.created', 'blackout_date', (string) $created[0]->id,
                ['from' => $start->toDateString(), 'to' => $end->toDateString(), 'reason' => $reason, 'startTime' => $startTime, 'endTime' => $endTime, 'sacraments' => $sacraments]);
        }

        // Existing appointments are kept; staff are shown who to call or move. A timed closure only touches visits that overlap its window.
        $window = $startTime !== null ? [$this->minutes($startTime), $this->minutes($endTime)] : null;
        $affected = Booking::holdingSlot()->with('user')
            ->whereIn(DB::raw('substr(appointment_date, 1, 10)'), $dates)
            ->when($sacraments !== null, fn ($q) => $q->whereIn('sacrament', $sacraments))
            ->orderBy('appointment_date')->orderBy('appointment_start')->get()
            ->when($window !== null, fn ($rows) => $rows->filter(
                fn (Booking $b) => $b->appointment_start !== null
                    && $this->minutes($b->appointment_start) < $window[1]
                    && $window[0] < $this->minutes($b->appointment_end ?? $b->appointment_start),
            ))
            ->map(fn (Booking $b) => [
                'id' => $b->id, 'referenceNumber' => $b->reference_number, 'sacrament' => $b->sacrament, 'subjectName' => $b->subjectName(),
                'appointmentDate' => $b->appointmentDateString(), 'appointmentStart' => $b->appointment_start,
            ])->values();

        return response()->json(['blackouts' => array_map($this->shape(...), $created), 'affectedBookings' => $affected], 201);
    }

    public function destroy(Request $request, string $id, AuditTrail $audit)
    {
        $row = BlackoutDate::findOrFail($id);
        $audit->record($request->user(), 'blackout.deleted', 'blackout_date', (string) $row->id, $this->shape($row));
        $row->delete();

        return response()->noContent();
    }

    private function shape(BlackoutDate $b): array
    {
        return [
            'id' => (int) $b->id, 'date' => $b->date->toDateString(), 'reason' => $b->reason,
            'startTime' => $b->start_time, 'endTime' => $b->end_time, 'sacraments' => $b->sacraments,
        ];
    }

    private function minutes(string $time): int
    {
        [$h, $m] = array_map('intval', explode(':', $time));

        return $h * 60 + $m;
    }
}
