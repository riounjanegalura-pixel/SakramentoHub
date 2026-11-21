<?php

namespace App\Http\Controllers\Api;

use App\Enums\BookingStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\CreateBookingRequest;
use App\Http\Resources\BookingResource;
use App\Models\Booking;
use App\Services\Booking\BookingStateMachine;
use App\Services\Booking\DraftEditor;
use App\Services\Register\CertificateRenderer;
use App\Services\Register\PrefilledCertificate;
use App\Support\ParishClock;
use App\Validation\OwnedDocument;
use Illuminate\Http\Request;

/** Parishioner booking endpoints. Every status change goes through BookingStateMachine. */
class BookingController extends Controller
{
    public function __construct(private BookingStateMachine $bookings) {}

    public function store(CreateBookingRequest $request)
    {
        $attributes = [
            'form_data' => $request->input('formData', []),
            'appointment_date' => $request->input('appointmentDate'),
            'appointment_start' => $request->input('appointmentStart'),
        ];

        // One draft per user+sacrament: re-posting the wizard updates it instead of duplicating.
        // Only the user's own online draft: a walk-in draft the office linked to them is the desk's.
        $booking = Booking::where('user_id', $request->user()->id)
            ->where('sacrament', $request->sacrament)
            ->where('status', BookingStatus::Draft)
            ->where('channel', 'online')
            ->first();

        if ($booking) {
            $booking->update($attributes);
        } else {
            $booking = Booking::create($attributes + [
                'user_id' => $request->user()->id,
                'sacrament' => $request->sacrament,
                'status' => BookingStatus::Draft,
            ]);
        }

        return new BookingResource($booking);
    }

    public function update(Request $request, string $id, DraftEditor $editor)
    {
        $request->validate(CreateBookingRequest::draftRules());
        $booking = $this->owned($request, $id);

        if (! in_array($booking->status, [BookingStatus::Draft, BookingStatus::Returned], true)) {
            return response()->json(['message' => 'Only a draft or a returned booking can be edited.'], 422);
        }

        $editor->apply($booking, $request);

        return new BookingResource($booking->fresh());
    }

    public function index(Request $request)
    {
        return BookingResource::collection(
            Booking::with('documentReviews.reviewer', 'registerEntry', 'milestoneTicks.doneByUser')->where('user_id', $request->user()->id)->visibleToOwner()->orderByDesc('created_at')->get(),
        );
    }

    public function show(Request $request, string $id)
    {
        return new BookingResource($this->owned($request, $id));
    }

    public function submit(Request $request, string $id)
    {
        if (! $request->user()->hasVerifiedEmail()) {
            return response()->json([
                'message' => 'Please verify your email address before submitting a booking. You can resend the verification email from the banner on your Home screen.',
            ], 403);
        }

        return new BookingResource($this->bookings->submit($this->owned($request, $id), $request->user()));
    }

    public function cancel(Request $request, string $id)
    {
        $request->validate(['reason' => ['required', 'string', 'max:255']]);

        return new BookingResource($this->bookings->cancel($this->owned($request, $id), $request->user(), $request->string('reason')->toString()));
    }

    public function reschedule(Request $request, string $id)
    {
        $request->validate([
            'appointmentDate' => ['required', 'date_format:Y-m-d', 'after_or_equal:'.ParishClock::todayString()],
            'appointmentStart' => ['required', 'date_format:H:i'],
        ]);

        return new BookingResource($this->bookings->reschedule(
            $this->owned($request, $id),
            $request->user(),
            $request->string('appointmentDate')->toString(),
            $request->string('appointmentStart')->toString(),
        ));
    }

    /** Adds one of a wedding's later documents after submission; the file must be one this parishioner uploaded. */
    public function attachDocument(Request $request, string $id, string $key)
    {
        $booking = $this->owned($request, $id);
        $request->validate(['fileUrl' => ['required', 'string', new OwnedDocument([$request->user()->id])]]);

        return new BookingResource($this->bookings->attachLateDocument($booking, $key, $request->string('fileUrl')->toString(), $request->user()));
    }

    /** The parishioner's own certificate, rendered from the register entry of a completed booking. */
    public function downloadCertificate(Request $request, string $id, CertificateRenderer $certificates, PrefilledCertificate $prefilled)
    {
        $booking = $this->owned($request, $id);
        $entry = $booking->registerEntry;

        // Once the parish has written the register entry, its certificate is the one. Before that, a baptism or a
        // wedding has the parish form filled in from the booking's own answers.
        $html = $entry ? $certificates->html($entry) : $prefilled->html($booking);

        if ($html === null) {
            return response()->json(['message' => 'No certificate yet.'], 404);
        }

        return response($html, 200, ['Content-Type' => 'text/html', 'Cache-Control' => 'no-store']);
    }

    private function owned(Request $request, string $id): Booking
    {
        return Booking::where('user_id', $request->user()->id)->visibleToOwner()->findOrFail($id);
    }
}
