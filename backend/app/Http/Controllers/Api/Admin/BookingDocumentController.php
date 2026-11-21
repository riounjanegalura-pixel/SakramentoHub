<?php

namespace App\Http\Controllers\Api\Admin;

use App\Enums\BookingStatus;
use App\Http\Controllers\Controller;
use App\Http\Resources\AdminBookingResource;
use App\Models\Booking;
use App\Models\BookingDocumentReview;
use App\Services\Booking\BookingAudit;
use App\Services\Booking\BookingNotifier;
use App\Services\Booking\BookingStateMachine;
use App\Services\Booking\WeddingMilestones;
use App\Validation\OwnedDocument;
use Illuminate\Http\Request;

class BookingDocumentController extends Controller
{
    public function review(Request $request, string $id, string $key, BookingAudit $audit, BookingNotifier $notify)
    {
        $request->validate([
            'status' => ['required', 'in:accepted,rejected'],
            'note' => ['required_if:status,rejected', 'nullable', 'string', 'max:500'],
        ]);

        $booking = Booking::findOrFail($id);
        // A wedding's later documents arrive after approval, so they alone can be reviewed on an approved booking.
        $isLate = $booking->sacrament === 'wedding' && in_array($key, WeddingMilestones::LATE_KEYS, true);
        $lateOnApproved = $booking->status === BookingStatus::Approved && $isLate;
        if ($booking->status !== BookingStatus::Submitted && ! $lateOnApproved) {
            return response()->json(['message' => 'Documents can only be reviewed while the booking is awaiting review.'], 422);
        }

        $doc = collect($booking->documentChecklist())->firstWhere('key', $key);
        if ($doc === null || $doc['url'] === null) {
            return response()->json(['message' => 'That document is not attached to this booking.'], 422);
        }

        $status = $request->string('status')->toString();
        BookingDocumentReview::updateOrCreate(
            ['booking_id' => $booking->id, 'document_key' => $key],
            ['file_url' => $doc['url'], 'status' => $status, 'note' => $status === 'rejected' ? $request->input('note') : null, 'reviewed_by' => $request->user()->id],
        );

        $audit->record($request->user(), "document.{$status}", $booking, ['documentKey' => $key, 'label' => $doc['label'], 'note' => $request->input('note')]);

        if ($isLate && $status === 'rejected') {
            // A later document is refused on its own: an approved booking is not returned for changes, and staff
            // returning a submitted one is a separate choice, so this is the word the owner gets.
            $notify->owner($booking, 'Document needs replacing', "{$doc['label']} for your {$notify->sacramentLabel($booking)} booking ({$booking->reference_number}) was not accepted: ".rtrim((string) $request->input('note'), '. ').'. Please upload a new copy.', mail: true);
        }

        return new AdminBookingResource($booking->fresh()->load('user'));
    }

    /** The office adds one of a wedding's later documents for a walk-in, who has no account to upload from. */
    public function attach(Request $request, string $id, string $key, BookingStateMachine $bookings)
    {
        $booking = Booking::findOrFail($id);
        if ($booking->channel !== 'walk_in') {
            return response()->json(['message' => "The office can add documents only to a walk-in booking. An online booking's owner uploads their own."], 422);
        }
        // The walk-in rule used at submit: the linked account's or the entering staff member's file, or any active staff member's.
        $request->validate(['fileUrl' => ['required', 'string', new OwnedDocument([$booking->user_id, $booking->created_by], true)]]);

        $booking = $bookings->attachLateDocument($booking, $key, $request->string('fileUrl')->toString(), $request->user());

        return new AdminBookingResource($booking->load('user', 'checkedInByUser'));
    }
}
