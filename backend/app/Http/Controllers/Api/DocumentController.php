<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

/**
 * Backs the sacrament wizards' prerequisite-document upload fields (e.g.
 * baptismal certificate, marriage license). Previously every one of those
 * inputs called `setValue(field, file.name)` — the file itself never left
 * the browser, so staff had nothing to actually open and review.
 *
 * Deliberately booking-agnostic: a wizard's draft booking isn't created
 * server-side until the final review step (see BookingController::store),
 * so a document field can be filled in long before a booking id exists to
 * attach it to. Uploading here first and writing the returned URL into
 * form_data — the same shape as any other field — lets the wizard keep its
 * existing "create the booking once, at review" flow unchanged.
 *
 * Stored on the private disk, scoped under the uploader's own user id, and
 * served back only through show() below (ownership-gated) — not a public,
 * unauthenticated URL. A baptismal certificate or marriage license is
 * exactly the kind of personal document RA 10173 cares about.
 */
class DocumentController extends Controller
{
    public function store(Request $request)
    {
        $request->validate([
            'file' => ['required', 'file', 'max:5120', 'mimes:jpg,jpeg,png,pdf'],
        ], [
            'file.required' => 'Choose a file to upload.',
            'file.file' => 'Choose a file to upload.',
            'file.uploaded' => 'The file could not be uploaded. It may be too large: use a file under 5 MB.',
            'file.mimes' => 'Upload a JPG, PNG or PDF file.',
            'file.max' => 'The file is larger than 5 MB. Upload a smaller file.',
        ]);

        $userId = $request->user()->id;
        $path = $request->file('file')->store("documents/{$userId}", 'local');
        $filename = basename($path);

        return response()->json(['url' => "/documents/{$userId}/{$filename}"]);
    }

    /**
     * True when a visible walk-in linked to this user has a staff/admin-uploaded file attached.
     */
    private function attachedToOwnBooking(string $ownerId, string $uploaderId, string $filename): bool
    {
        // Only what staff uploaded for the walk-in the office linked to this account. A parishioner
        // pasting someone else's file URL into their own draft must not unlock it.
        $uploader = \App\Models\User::find($uploaderId);
        if ($uploader === null || ! $uploader->is_active || ! in_array($uploader->role, config('roles.staff_side'), true)) {
            return false;
        }

        $url = "/documents/{$uploaderId}/{$filename}";

        return Booking::where('user_id', $ownerId)->where('channel', 'walk_in')->visibleToOwner()
            ->where('form_data', 'like', "%{$filename}%")->get()
            ->contains(function (Booking $b) use ($url) {
                $found = false;
                $data = (array) $b->form_data;
                array_walk_recursive($data, function ($value) use ($url, &$found) {
                    $found = $found || $value === $url;
                });

                return $found;
            });
    }

    /**
     * Serves one uploaded document. Ownership-gated (the uploader, or
     * staff/admin) — a plain <img>/<a> can't attach the Authorization header
     * this requires, so callers fetch it via the API client and render the
     * response as a blob URL (see lib/hooks/useAuthenticatedBlobUrl.ts in
     * both frontends).
     */
    public function show(Request $request, string $userId, string $filename)
    {
        $user = $request->user();

        if ($user->id !== $userId && ! in_array($user->role, config('roles.staff_side'), true) && ! $this->attachedToOwnBooking($user->id, $userId, $filename)) {
            abort(403);
        }

        $path = "documents/{$userId}/{$filename}";

        if (! Storage::disk('local')->exists($path)) {
            abort(404);
        }

        // An explicit type and `inline` so a PDF is shown, not downloaded, and the viewer can tell it from an image.
        return Storage::disk('local')->response($path, null, [
            'Content-Type' => Storage::disk('local')->mimeType($path) ?: 'application/octet-stream',
            'Content-Disposition' => 'inline',
        ]);
    }
}
