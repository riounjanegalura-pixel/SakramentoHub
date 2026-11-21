<?php

namespace App\Services\Privacy;

use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use InvalidArgumentException;

/**
 * Removes everything the system holds about one email address: the account, its bookings and their files and notes,
 * certificate requests, wallet and ID photos, notifications, tokens, sessions, queued mail, and the activity log
 * entries about them. Used for a data-privacy request ("erase my data").
 *
 * Kept on purpose, and reported:
 *  - Register entries are the parish's permanent sacrament record (a name and a date, no email). They stay unless
 *    `$includeRegister` is true; their link to the deleted booking is cleared either way.
 *  - Donations are financial records: the gift stays, the link to the person is cleared.
 *  - Staff-side references (who reviewed, who created) are cleared rather than deleting other people's records.
 *
 * A dry run counts and changes nothing. The real run is one transaction: it all happens or none of it does. The only
 * trace left is one audit row that holds a hash of the email, never the email itself.
 */
class PersonEraser
{
    /** @return array<string, int> what was (or, on a dry run, would be) removed, by kind */
    public function erase(string $email, bool $dryRun = true, bool $includeRegister = false, ?User $by = null): array
    {
        $email = mb_strtolower(trim($email));
        if (! filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new InvalidArgumentException('Enter a valid email address.');
        }

        $user = User::whereRaw('lower(email) = ?', [$email])->first();
        if ($user && in_array($user->role, ['admin', 'staff'], true)) {
            throw new InvalidArgumentException('This is an admin account. Change its role first; admin accounts are not erased here.');
        }
        $userId = $user?->id;
        // "!" is the escape character, so a % or _ in an address is matched literally on every database.
        $like = '%'.str_replace(['!', '%', '_'], ['!!', '!%', '!_'], $email).'%';

        $counts = [];
        $files = [];
        $work = function () use ($email, $like, $userId, $dryRun, $includeRegister, $by, &$counts, &$files) {
            $bookingIds = DB::table('bookings')
                ->where(function ($q) use ($userId, $like) {
                    if ($userId) {
                        $q->where('user_id', $userId);
                    }
                    $q->orWhereRaw("lower(cast(owner_snapshot as char)) like ? escape '\\'", [$like])
                        ->orWhereRaw("lower(cast(form_data as char)) like ? escape '\\'", [$like]);
                })->pluck('id')->all();

            $certIds = DB::table('certificate_requests')
                ->where(function ($q) use ($userId, $like) {
                    if ($userId) {
                        $q->where('user_id', $userId);
                    }
                    $q->orWhereRaw("lower(cast(owner_snapshot as char)) like ? escape '\\'", [$like]);
                })->pluck('id')->all();

            // Files: every upload named in these records, plus the person's own folder.
            foreach (DB::table('bookings')->whereIn('id', $bookingIds)->pluck('form_data') as $json) {
                $this->collectFiles($json, $files);
            }
            foreach (DB::table('booking_document_reviews')->whereIn('booking_id', $bookingIds)->pluck('file_url') as $f) {
                $files[] = $f;
            }
            foreach (DB::table('certificate_requests')->whereIn('id', $certIds)->get(['id_url', 'letter_url']) as $row) {
                array_push($files, ...array_filter([$row->id_url, $row->letter_url]));
            }
            if ($userId) {
                foreach (DB::table('wallet_documents')->where('user_id', $userId)->pluck('file_url') as $f) {
                    $files[] = $f;
                }
                foreach (Storage::disk('local')->files("documents/{$userId}") as $path) {
                    $files[] = '/'.$path;
                }
            }
            $files = array_values(array_unique(array_filter($files)));

            $registerIds = $bookingIds ? DB::table('register_entries')->whereIn('booking_id', $bookingIds)->pluck('id')->all() : [];

            $count = function (string $key, $query) use (&$counts, $dryRun) {
                $counts[$key] = $dryRun ? (clone $query)->count() : $query->delete();
            };

            // Things hanging off the bookings and requests come first.
            if ($bookingIds) {
                $count('booking notes', DB::table('booking_notes')->whereIn('booking_id', $bookingIds));
                $count('booking milestones', DB::table('booking_milestones')->whereIn('booking_id', $bookingIds));
                $count('document reviews', DB::table('booking_document_reviews')->whereIn('booking_id', $bookingIds));
                if (Schema::hasTable('sent_reminders')) {
                    $count('sent reminders', DB::table('sent_reminders')->whereIn('booking_id', $bookingIds));
                }
                $count('booking notifications', DB::table('notifications')->whereIn('booking_id', $bookingIds));
            }

            // The register keeps the sacrament record; only its link to the booking goes (or the entry, if asked).
            $counts['register entries kept'] = $includeRegister ? 0 : count($registerIds);
            if ($registerIds) {
                if ($includeRegister) {
                    $count('register entries', DB::table('register_entries')->whereIn('id', $registerIds));
                } elseif (! $dryRun) {
                    DB::table('register_entries')->whereIn('id', $registerIds)->update(['booking_id' => null]);
                }
            }
            if ($certIds && ! $dryRun) {
                DB::table('certificate_requests')->whereIn('id', $certIds)->update(['register_entry_id' => null]);
            }

            $count('certificate requests', DB::table('certificate_requests')->whereIn('id', $certIds ?: ['-']));
            $count('bookings', DB::table('bookings')->whereIn('id', $bookingIds ?: ['-']));

            if ($userId) {
                $count('wallet documents', DB::table('wallet_documents')->where('user_id', $userId));
                $count('notifications', DB::table('notifications')->where('user_id', $userId));
                $count('notification settings', DB::table('notification_preferences')->where('user_id', $userId));
                $count('sign-in tokens', DB::table('personal_access_tokens')->where('tokenable_id', $userId)->where('tokenable_type', User::class));
                if (Schema::hasTable('sessions')) {
                    $count('sessions', DB::table('sessions')->where('user_id', $userId));
                }
                // A gift is a financial record: it stays, without the person's name on it.
                if (Schema::hasTable('donations')) {
                    $counts['donations unlinked'] = DB::table('donations')->where('user_id', $userId)->count();
                    if (! $dryRun) {
                        DB::table('donations')->where('user_id', $userId)->update(['user_id' => null]);
                    }
                }
                // Other people's records that only point at this account (a staff member's own work) lose the pointer.
                if (! $dryRun) {
                    $this->clearPointers($userId);
                }
            }

            $count('verification codes', DB::table('email_verification_tokens')->whereRaw('lower(email) = ?', [$email]));
            $count('password reset requests', DB::table('password_reset_tokens')->whereRaw('lower(email) = ?', [$email]));
            foreach (['jobs' => 'queued mail', 'failed_jobs' => 'failed mail'] as $table => $label) {
                if (Schema::hasTable($table)) {
                    $count($label, DB::table($table)->whereRaw("lower(cast(payload as char)) like ? escape '\\'", [$like]));
                }
            }

            // The activity log: entries by this person, about this person's records, or naming the email.
            $audit = DB::table('audit_logs')->where(function ($q) use ($userId, $bookingIds, $certIds, $like) {
                if ($userId) {
                    $q->where('actor_user_id', $userId)->orWhere(fn ($w) => $w->where('subject_type', 'user')->where('subject_id', $userId));
                }
                if ($bookingIds) {
                    $q->orWhere(fn ($w) => $w->where('subject_type', 'booking')->whereIn('subject_id', $bookingIds));
                }
                if ($certIds) {
                    $q->orWhere(fn ($w) => $w->where('subject_type', 'certificate_request')->whereIn('subject_id', $certIds));
                }
                $q->orWhereRaw("lower(cast(metadata as char)) like ? escape '\\'", [$like]);
            });
            $count('activity log entries', $audit);

            $counts['accounts'] = $userId ? ($dryRun ? 1 : DB::table('users')->where('id', $userId)->delete()) : 0;
            $counts['files'] = count($files);

            if (! $dryRun) {
                // Last, so it is the only trace: no email, only a hash and the counts.
                AuditLog::create([
                    'actor_user_id' => $by?->id,
                    'action' => 'privacy.erased',
                    'subject_type' => 'privacy_request',
                    'subject_id' => hash('sha256', $email),
                    'metadata' => ['emailHash' => hash('sha256', $email), 'counts' => $counts, 'includeRegister' => $includeRegister],
                    'created_at' => now(),
                ]);
            }
        };

        if ($dryRun) {
            $work();
        } else {
            DB::transaction($work);
            // Files go only after the database commit succeeded, and a missing file is not an error.
            foreach ($files as $url) {
                $path = ltrim((string) $url, '/');
                if (str_starts_with($path, 'documents/')) {
                    Storage::disk('local')->delete($path);
                }
            }
            if ($userId) {
                Storage::disk('local')->deleteDirectory("documents/{$userId}");
            }
        }

        return $counts;
    }

    /** Upload URLs inside a booking's answers. */
    private function collectFiles(mixed $json, array &$files): void
    {
        $data = is_string($json) ? (json_decode($json, true) ?? []) : (array) $json;
        array_walk_recursive($data, function ($value) use (&$files) {
            if (is_string($value) && str_starts_with($value, '/documents/')) {
                $files[] = $value;
            }
        });
    }

    /** Staff-side columns that name this account: cleared, never the other person's record deleted. */
    private function clearPointers(string $userId): void
    {
        foreach ([
            'bookings' => 'created_by', 'certificate_requests' => 'handled_by', 'booking_document_reviews' => 'reviewed_by',
            'booking_milestones' => 'done_by', 'booking_notes' => 'author_id',
            'register_entries' => 'entered_by', 'parish_events' => 'created_by',
        ] as $table => $column) {
            try {
                if (Schema::hasTable($table) && Schema::hasColumn($table, $column)) {
                    DB::table($table)->where($column, $userId)->update([$column => null]);
                }
            } catch (\Throwable) {
                // A column that cannot be empty keeps its value: the account was never staff.
            }
        }
    }
}
