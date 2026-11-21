<?php

namespace App\Console\Commands;

use App\Models\NotificationPreference;
use App\Services\Booking\BookingNotifier;
use App\Services\Booking\ReminderWindows;
use App\Support\ParishClock;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Sends each reminder once. The ledger row is written first and only the run that actually added it sends, so two
 * overlapping runs cannot both send; the unique key (booking, kind, subject) is the rule, and the subject (a date,
 * a step) is what lets a moved booking be reminded again.
 *
 * The email is queued after the ledger transaction commits (BookingNotifier). If that push fails the in-app
 * notification and the ledger row are already committed, so the email is lost for this reminder: it is logged by the
 * notifier and the row is kept on purpose, because deleting it would send the in-app notification a second time.
 */
class SendReminders extends Command
{
    protected $signature = 'reminders:send';

    protected $description = 'Send appointment, payment, returned-booking and wedding-step reminders that are due and not yet sent';

    public function handle(ReminderWindows $windows, BookingNotifier $notify): int
    {
        $sent = array_fill_keys(ReminderWindows::KINDS, 0);

        foreach ($windows->due(ParishClock::now()) as $r) {
            try {
                $didSend = DB::transaction(function () use ($r, $notify) {
                    $inserted = DB::table('sent_reminders')->insertOrIgnore([
                        'booking_id' => $r['booking']->id, 'kind' => $r['kind'], 'subject' => $r['subject'], 'sent_at' => now(),
                    ]);
                    if ($inserted === 0) {
                        return false;
                    }

                    // The in-app notification is always written; the email follows the owner's booking-reminders choice
                    // (no preference row counts as on, the column default). A walk-in has no account to ask.
                    $b = $r['booking'];
                    $mail = $notify->mailAddressFor($b) !== null
                        && ($b->user_id === null || NotificationPreference::where('user_id', $b->user_id)->value('booking_reminders') !== false);
                    $notify->owner($b, $r['title'], $r['body'], mail: $mail, subject: $r['mailSubject']);
                    if ($r['alsoStaff'] !== null) {
                        $notify->staff($r['title'], $r['alsoStaff'], $b);
                    }

                    return true;
                });
                if ($didSend) {
                    $sent[$r['kind']]++;
                }
            } catch (\Throwable $e) {
                // One booking's failure must not stop the rest. It happened before the commit (a failed email push does not get here), so the ledger row rolled back and the next run retries it.
                Log::error('Failed to send a reminder.', ['booking' => $r['booking']->id, 'kind' => $r['kind'], 'error' => $e->getMessage()]);
            }
        }

        foreach ($sent as $kind => $count) {
            $this->info("{$kind}: {$count}");
        }

        return self::SUCCESS;
    }
}
