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
        $created = [];
        $dates = [];
        for ($day = $start; $day->lte($end); $day = $day->addDay()) {
            $dates[] = $date = $day->toDateString();
            $exists = BlackoutDate::whereDate('date', $date)->where('reason', $reason)->get()
                ->contains(fn (BlackoutDate $b) => $b->sacraments == $sacraments);
            if (! $exists) {
                $created[] = BlackoutDate::create(['date' => $date, 'reason' => $reason, 'sacraments' => $sacraments]);
            }
        }

        if ($created !== []) {
            $audit->record($request->user(), 'blackout.created', 'blackout_date', (string) $created[0]->id,
                ['from' => $start->toDateString(), 'to' => $end->toDateString(), 'reason' => $reason, 'sacraments' => $sacraments]);
        }

        // Existing appointments are kept; staff are shown who to call or move.
        $affected = Booking::holdingSlot()->with('user')
            ->whereIn(DB::raw('substr(appointment_date, 1, 10)'), $dates)
            ->when($sacraments !== null, fn ($q) => $q->whereIn('sacrament', $sacraments))
            ->orderBy('appointment_date')->orderBy('appointment_start')->get()
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
        return ['id' => (int) $b->id, 'date' => $b->date->toDateString(), 'reason' => $b->reason, 'sacraments' => $b->sacraments];
    }
}
