<?php
// backend/app/Http/Controllers/Api/AvailabilityController.php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\Service;
use App\Services\Scheduling\AppointmentRequest;
use App\Services\Scheduling\SchedulingService;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;

/**
 * Public (no PII) availability for the booking calendar. Every answer comes
 * from SchedulingService — the same rules submit/approve/reschedule enforce —
 * so what the calendar shows and what the server accepts cannot drift.
 */
class AvailabilityController extends Controller
{
    public function __construct(private SchedulingService $scheduling) {}

    public function show(Request $request, string $sacrament)
    {
        $service = Service::findOrFail($sacrament);
        $request->validate(['date' => ['required', 'date_format:Y-m-d']] + $this->contextRules());

        return response()->json($this->scheduling->dayStatus(
            AppointmentRequest::make($service, $request->string('date')->toString(), null, $this->context($request)),
            $this->ownBooking($request),
            $this->bookingTime($request),
        ));
    }

    public function range(Request $request, string $sacrament)
    {
        $service = Service::findOrFail($sacrament);
        $request->validate([
            'start' => ['required', 'date_format:Y-m-d'],
            'end' => ['required', 'date_format:Y-m-d', 'after_or_equal:start'],
        ] + $this->contextRules());

        $start = CarbonImmutable::parse($request->string('start')->toString());
        $end = CarbonImmutable::parse($request->string('end')->toString());
        if ($start->diffInDays($end) > 61) {
            return response()->json(['message' => 'The range may cover at most 62 days.'], 422);
        }

        $own = $this->ownBooking($request);
        $bookingTime = $this->bookingTime($request);
        $days = [];
        for ($day = $start; $day->lte($end); $day = $day->addDay()) {
            $status = $this->scheduling->dayStatus(
                AppointmentRequest::make($service, $day->toDateString(), null, $this->context($request)),
                $own,
                $bookingTime,
            );
            $days[] = [
                'date' => $status['date'],
                'status' => $status['status'],
                'reason' => $status['reason'],
                'freeCount' => count($status['freeStarts']),
            ];
        }

        return response()->json(['sacrament' => $service->id, 'days' => $days]);
    }

    private function contextRules(): array
    {
        return [
            'scheduleType' => ['sometimes', 'in:regular,special'],
            'massType' => ['sometimes', 'in:church,house'],
            'excludeBookingId' => ['sometimes', 'nullable', 'string', 'max:64'],
            'waiveLeadTime' => ['sometimes', 'boolean'],
        ];
    }

    /**
     * The caller's own booking named by `excludeBookingId`, so it does not
     * block its own slot while they edit it. These routes are public, so the
     * signed-in user is resolved optionally; an id that is not the caller's
     * (or a guest's request) is ignored rather than refused — the answer is
     * then the ordinary public one and nothing about the booking leaks.
     */
    private function ownBooking(Request $request): ?Booking
    {
        $id = $request->query('excludeBookingId');
        $user = auth('sanctum')->user();
        if (! is_string($id) || $id === '' || $user === null) {
            return null;
        }

        // The office edits and moves anyone's booking, so it may exclude any of them.
        return $this->staffCaller()
            ? Booking::find($id)
            : Booking::where('user_id', $user->id)->find($id);
    }

    /** A signed-in, active staff or admin account (these routes are public, so auth is optional). */
    private function staffCaller(): bool
    {
        $user = auth('sanctum')->user();

        return $user !== null && $user->is_active && in_array($user->role, config('roles.staff_side'), true);
    }

    /** Lead time is a booking-time rule the office may waive for a walk-in; anyone else's request ignores the flag. */
    private function bookingTime(Request $request): bool
    {
        return ! ($request->boolean('waiveLeadTime') && $this->staffCaller());
    }

    private function context(Request $request): array
    {
        return array_filter($request->only(['scheduleType', 'massType']));
    }
}
