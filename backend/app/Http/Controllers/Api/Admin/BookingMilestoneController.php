<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\AdminBookingResource;
use App\Models\Booking;
use App\Services\Booking\WeddingMilestones;
use App\Support\ParishClock;
use Illuminate\Http\Request;

/** The wedding preparation steps staff tick by hand (spec §6). Derived steps are never written here. */
class BookingMilestoneController extends Controller
{
    public function update(Request $request, string $id, string $key, WeddingMilestones $milestones)
    {
        $booking = Booking::findOrFail($id);
        $request->validate(['done' => ['required', 'boolean']]);
        // Said first, so a step this booking cannot take is not answered with a list of missing fields.
        $milestones->guard($booking, $key);

        if (! $request->boolean('done')) {
            return $this->respond($milestones->untick($booking, $key, $request->user()));
        }

        $license = $key === 'marriage_license';
        $art34 = $license && $request->boolean('art34');
        $details = $license && ! $art34;
        $request->validate([
            // The note says who vouched and why: it is the record when there is no license number or document behind the tick.
            'note' => [$key === 'mixed_marriage_permission' || $art34 ? 'required' : 'nullable', 'string', 'max:500'],
            'art34' => ['sometimes', 'boolean'],
            'licenseNumber' => [$details ? 'required' : 'exclude', 'string', 'max:40'],
            'issuedOn' => [$details ? 'required' : 'exclude', 'date_format:Y-m-d', 'before_or_equal:'.ParishClock::todayString()],
            'issuedAt' => [$details ? 'required' : 'exclude', 'string', 'max:120'],
        ], ['issuedOn.before_or_equal' => 'The issue date cannot be in the future.']);

        $data = null;
        if ($art34) {
            $data = ['art34' => true];
        } elseif ($details) {
            $data = [
                'licenseNumber' => trim($request->string('licenseNumber')->toString()),
                'issuedOn' => $request->string('issuedOn')->toString(),
                'issuedAt' => trim($request->string('issuedAt')->toString()),
            ];
        }

        $note = trim((string) $request->input('note'));

        return $this->respond($milestones->tick($booking, $key, $request->user(), $note !== '' ? $note : null, $data));
    }

    private function respond(Booking $booking): AdminBookingResource
    {
        return new AdminBookingResource($booking->load('user', 'checkedInByUser'));
    }
}
