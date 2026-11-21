<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\CertificateRequest;
use App\Models\RegisterEntry;
use App\Services\Register\CertificateRenderer;
use App\Services\Register\ParishRegister;
use Illuminate\Http\Request;

class RegisterEntryController extends Controller
{
    /**
     * The entries a parishioner may open, newest ceremony first: those of their own visible bookings, and those
     * the office issued to them on a certificate request. An entry reachable both ways is listed once, as a booking one.
     */
    public function index(Request $request, CertificateRenderer $certificates)
    {
        $userId = $request->user()->id;
        $bookingIds = Booking::where('user_id', $userId)->visibleToOwner()->pluck('id');
        $issuedIds = $this->issuedRequests($userId)->select('register_entry_id');

        $entries = RegisterEntry::query()
            ->where(fn ($q) => $q->whereIn('booking_id', $bookingIds)->orWhereIn('id', $issuedIds))
            ->orderByDesc('ceremony_date')->orderByDesc('sequence')->get();
        $viaBooking = $bookingIds->flip();

        return response()->json($entries->map(fn (RegisterEntry $e) => [
            'id' => $e->id,
            'registerNumber' => $e->register_number,
            'register' => ParishRegister::label($e->sacrament),
            'subjectName' => $e->subject_name,
            'ceremonyDate' => $e->ceremony_date->toDateString(),
            'status' => $e->status,
            'verifyUrl' => $certificates->verifyUrl($e),
            'via' => $e->booking_id !== null && $viaBooking->has($e->booking_id) ? 'booking' : 'request',
        ])->values());
    }

    /**
     * A parishioner's certificate by register entry id: allowed when the entry's booking is theirs, or when it
     * fulfils an issued request of theirs (the certificate then states the request's purpose).
     */
    public function certificate(Request $request, string $id, CertificateRenderer $certificates)
    {
        $entry = RegisterEntry::findOrFail($id);
        $userId = $request->user()->id;

        $owned = $entry->booking_id !== null
            && Booking::where('user_id', $userId)->visibleToOwner()->whereKey($entry->booking_id)->exists();
        $purpose = null;
        if (! $owned) {
            $issued = $this->issuedRequests($userId)->where('register_entry_id', $entry->id)->orderByDesc('closed_at')->first();
            abort_if($issued === null, 404);
            $purpose = $issued->purpose;
        }

        return response($certificates->html($entry, $purpose), 200, ['Content-Type' => 'text/html', 'Cache-Control' => 'no-store']);
    }

    /** The user's requests that the office issued against an entry. */
    private function issuedRequests(string $userId)
    {
        return CertificateRequest::where('user_id', $userId)->where('status', 'issued')->whereNotNull('register_entry_id');
    }
}
