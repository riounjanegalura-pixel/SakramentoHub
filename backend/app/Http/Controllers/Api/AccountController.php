<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\DeleteAccountRequest;
use App\Models\AppNotification;
use App\Http\Resources\CertificateRequestResource;
use App\Models\Booking;
use App\Models\CertificateRequest;
use App\Models\NotificationPreference;
use App\Models\RegisterEntry;
use App\Models\WalletDocument;
use App\Services\Register\ParishRegister;
use App\Support\StoredDocuments;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

/**
 * The self-service half of RA 10173's access/deletion rights (item 11's
 * remainder) — PrivacyNoticeScreen already told parishioners they have these
 * rights; this is what actually delivers them, rather than "contact the
 * parish office" being the only real mechanism.
 */
class AccountController extends Controller
{
    /**
     * GET /me/export — everything about the authenticated user, and nothing
     * about anyone else. Deliberately excludes internal-only columns
     * (password hash, remember_token — already in User::$hidden anyway,
     * but built explicitly here rather than relying on that alone) and
     * Sanctum tokens. JSON is a real, complete, machine-readable export —
     * zero-cost, no PDF/CSV generation library needed to satisfy the right.
     */
    public function export(Request $request)
    {
        $user = $request->user();

        $bookings = Booking::where('user_id', $user->id)
            ->visibleToOwner()
            ->orderBy('created_at')
            ->get()
            ->map(fn (Booking $b) => [
                'referenceNumber' => $b->reference_number,
                'sacrament' => $b->sacrament,
                'status' => $b->status,
                'formData' => $b->form_data,
                'appointmentDate' => $b->appointmentDateString(),
                'appointmentStart' => $b->appointment_start,
                'paymentStatus' => $b->payment_status?->value,
                'statusReason' => $b->status_reason,
                'createdAt' => $b->created_at?->toISOString(),
            ]);

        $notifications = AppNotification::where('user_id', $user->id)
            ->orderBy('created_at')
            ->get()
            ->map(fn (AppNotification $n) => [
                'title' => $n->title,
                'body' => $n->body,
                'read' => $n->read,
                'createdAt' => $n->created_at?->toISOString(),
            ]);

        // Metadata only: what the person stored and when, never the file or its address.
        $wallet = WalletDocument::where('user_id', $user->id)->orderBy('created_at')->get()
            ->map(fn (WalletDocument $d) => [
                'id' => $d->id,
                'kind' => $d->kind,
                'personName' => $d->person_name,
                'originalName' => $d->original_name,
                'mime' => $d->mime,
                'sizeBytes' => $d->size_bytes,
                'createdAt' => $d->created_at->toIso8601String(),
            ]);

        $requests = CertificateRequest::where('user_id', $user->id)->with('registerEntry')->orderBy('created_at')->get();

        // The entries this person can open: those of their own bookings and those issued to them on a request.
        $entries = RegisterEntry::query()
            ->where(fn ($q) => $q
                ->whereIn('booking_id', Booking::where('user_id', $user->id)->visibleToOwner()->select('id'))
                ->orWhereIn('id', CertificateRequest::where('user_id', $user->id)->where('status', 'issued')->whereNotNull('register_entry_id')->select('register_entry_id')))
            ->orderBy('ceremony_date')->orderBy('sequence')->get()
            ->map(fn (RegisterEntry $e) => [
                'registerNumber' => $e->register_number,
                'register' => ParishRegister::label($e->sacrament),
                'ceremonyDate' => $e->ceremony_date->toDateString(),
                'status' => $e->status,
            ]);

        $prefs = NotificationPreference::where('user_id', $user->id)->first();

        $export = [
            'exportedAt' => now()->toISOString(),
            'profile' => [
                'fullName' => $user->full_name,
                'email' => $user->email,
                'phone' => $user->phone,
                'address' => $user->address,
                'role' => $user->role,
                'emailVerifiedAt' => $user->email_verified_at?->toISOString(),
                'privacyConsentAt' => $user->privacy_consent_at?->toISOString(),
                'createdAt' => $user->created_at?->toISOString(),
            ],
            'bookings' => $bookings,
            'notifications' => $notifications,
            'wallet' => $wallet,
            'certificateRequests' => CertificateRequestResource::collection($requests)->resolve($request),
            'registerEntries' => $entries,
            'notificationPreferences' => $prefs ? [
                'pushEnabled' => $prefs->push_enabled,
                'bookingReminders' => $prefs->booking_reminders,
                'parishAnnouncements' => $prefs->parish_announcements,
            ] : null,
        ];

        return response()->json($export, 200, [
            'Content-Disposition' => 'attachment; filename="sakramentohub-my-data.json"',
        ]);
    }

    /**
     * DELETE /me — the account-deletion right. Implemented as hard-delete of
     * the `users` row (with the current password re-confirmed first, same
     * safety pattern as ProfileController::changePassword) rather than a
     * soft "is_active = false" flag, because that flag already means
     * something else (admin-initiated suspension, Admin\UserController) and
     * because the honest claim here is that the account is actually gone —
     * not merely disabled.
     *
     * Booking history and audit-log rows are NOT cascade-deleted (see the
     * 2026_09_05_040000 migration for bookings, 2026_09_04_220000 for the
     * audit log) — the parish's own recordkeeping obligation survives the
     * account. What's kept is denormalized into `owner_snapshot` /
     * `metadata` first, then user_id/actor_user_id are left to go null.
     * Notifications and notification_preferences DO cascade-delete — they
     * are the user's own inbox/settings with no independent recordkeeping
     * value, so removing them is the more privacy-respecting choice, not a
     * gap.
     *
     * Wallet rows, draft bookings and every file in the user's upload folder
     * that nothing still uses go too; open certificate requests are cancelled
     * with their ID files; every request keeps an owner snapshot. Register
     * entries and the files of the bookings that stay remain. The ID check row
     * goes with the wallet rows by cascade and the ID image in the folder sweep;
     * its audit rows stay with the name and email copied into them.
     *
     * The user's email becomes available for a new registration immediately
     * — the row is really gone, so there's nothing left to collide with.
     */
    public function destroy(DeleteAccountRequest $request)
    {
        $user = $request->user();

        if (! Hash::check($request->currentPassword, $user->password)) {
            throw ValidationException::withMessages([
                'currentPassword' => ['Current password is incorrect'],
            ]);
        }

        // Files to remove once the account is really gone; a booking, review or request that still uses one keeps it.
        $files = DB::transaction(function () use ($user) {
            $snapshot = ['fullName' => $user->full_name, 'email' => $user->email];

            // A draft is unfinished work, not a parish record; its files go with the folder sweep below.
            // A draft the office started for a walk-in is staff work and has its own clean-up.
            Booking::where('user_id', $user->id)->where('status', 'draft')->where('channel', '!=', 'walk_in')->get()->each->delete();

            Booking::where('user_id', $user->id)->get()->each(function (Booking $booking) use ($snapshot) {
                // A linked walk-in already holds the contact staff typed at the counter (phone,
                // relationship): keep it, filling only what it lacks from the account.
                // accountDeleted stops every later email: the address belonged to the account.
                $booking->update(['owner_snapshot' => ($booking->channel === 'walk_in'
                    ? array_filter((array) $booking->owner_snapshot, fn ($v) => $v !== null) + $snapshot
                    : $snapshot) + ['accountDeleted' => true]]);
            });

            // The wallet is the person's own store: the rows go, and so do the files no booking still needs.
            $files = WalletDocument::where('user_id', $user->id)->pluck('file_url')->all();
            WalletDocument::where('user_id', $user->id)->delete();

            // A request still open is withdrawn, with its ID and letter. A closed one stays as the office's record of
            // what it did and for whom; its files follow the usual 30-day clean-up.
            CertificateRequest::where('user_id', $user->id)->get()->each(function (CertificateRequest $request) use ($snapshot, &$files) {
                $changes = ['owner_snapshot' => $snapshot + ['accountDeleted' => true]];
                if ($request->status === 'submitted') {
                    array_push($files, ...array_filter([$request->id_url, $request->letter_url]));
                    $changes += ['status' => 'cancelled', 'closed_at' => now(), 'id_url' => null, 'letter_url' => null, 'files_removed_at' => now()];
                }
                $request->update($changes);
            });

            // Revoke every Sanctum token up front — belt-and-suspenders with
            // the row deletion itself, in case anything ever changes the
            // tokenable relation to not cascade automatically.
            $user->tokens()->delete();

            // Both password_reset_tokens and email_verification_tokens are
            // keyed by email, not user id, and outlive the user row they were
            // issued for — without this, a reset/verification link mailed
            // before deletion stays valid, and since the email immediately
            // becomes available for a new registration (see docblock above),
            // that stale token could be replayed against a completely
            // different person's brand-new account once they register with
            // the same address.
            DB::table('password_reset_tokens')->where('email', $user->email)->delete();
            DB::table('email_verification_tokens')->where('email', $user->email)->delete();

            $user->delete();

            return $files;
        });

        // Everything in the user's own upload folder: never-attached uploads and replaced late files go too.
        // A file a surviving booking, review or request still uses stays (deleteIfUnreferenced).
        try {
            foreach (Storage::disk('local')->files("documents/{$user->id}") as $path) {
                $files[] = '/'.$path;
            }
        } catch (\Throwable $e) {
            Log::warning('Could not list the upload folder of a deleted account.', ['error' => $e->getMessage()]);
        }

        // After the commit, so a failure here can never undo the deletion.
        foreach (array_unique($files) as $file) {
            try {
                StoredDocuments::deleteIfUnreferenced($file);
            } catch (\Throwable $e) {
                Log::warning('Could not delete a file of a deleted account.', ['error' => $e->getMessage()]);
            }
        }

        return response()->noContent();
    }
}
