<?php

namespace App\Services\Booking;

use App\Models\Booking;
use App\Services\Scheduling\SchedulingService;
use Illuminate\Http\Request;

/**
 * Applies a draft PATCH, shared by online drafts and walk-ins: a present key
 * (even null) is applied; an absent key leaves the column alone.
 */
class DraftEditor
{
    public function __construct(private SchedulingService $scheduling) {}

    public function apply(Booking $booking, Request $request): void
    {
        $changes = [];
        if ($request->input('formData') !== null) {
            $changes['form_data'] = $request->input('formData');
        }
        if ($request->exists('appointmentDate')) {
            $changes['appointment_date'] = $request->input('appointmentDate');
        }
        if ($request->exists('appointmentStart')) {
            $changes['appointment_start'] = $request->input('appointmentStart');
        }
        $booking->fill($changes);

        // The end time always follows the stored date and start: a returned
        // booking still holds its slot, so a stale end would block the wrong
        // interval (or none). No date or no start means no end.
        $booking->appointment_end = $booking->appointmentDateString() && $booking->appointment_start
            ? $this->scheduling->endFor($booking->appointmentRequest())
            : null;
        $booking->save();
    }
}
