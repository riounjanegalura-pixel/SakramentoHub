<?php

namespace App\Services\Booking;

use App\Mail\BookingMail;
use App\Models\AppNotification;
use App\Models\Booking;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

class BookingNotifier
{
    /**
     * The in-app notification for the booking's owner, and an email when $mail. The email is for what the parish did
     * to the person's request, never for what they just did themselves. A walk-in has no account to notify in the
     * app but may still be mailed at the address staff took at the counter; their email carries a button only when
     * $walkInUrl is given (they cannot open a booking page).
     */
    public function owner(Booking $booking, string $title, string $body, bool $mail = false, ?string $subject = null, ?string $actionLabel = null, ?string $walkInUrl = null): void
    {
        if ($booking->user_id !== null) {
            $this->write($booking->user_id, $title, $body, $booking->id);
        }

        if (! $mail) {
            return;
        }

        $address = $this->mailAddressFor($booking);
        if ($address === null) {
            return;
        }

        $hasAccount = $booking->user_id !== null;
        $this->send(
            $address,
            $subject ?? "{$title} ({$booking->reference_number})",
            (string) $booking->ownerName(),
            $body,
            $hasAccount || $walkInUrl !== null ? ($actionLabel ?? 'View booking') : null,
            $hasAccount ? $this->bookingUrl($booking) : $walkInUrl,
        );
    }

    /** A notification for a person who is not tied to a booking; an email too when $mail, with an optional button. */
    public function user(User $user, string $title, string $body, bool $mail = false, ?string $actionUrl = null, ?string $actionLabel = null, ?string $subject = null): void
    {
        $this->write($user->id, $title, $body);

        if ($mail && $this->deliverable($user->email)) {
            $this->send($user->email, $subject ?? $title, $user->full_name, $body, $actionUrl !== null ? ($actionLabel ?? 'Open') : null, $actionUrl);
        }
    }

    public function staff(string $title, string $body, ?Booking $booking = null, ?string $link = null): void
    {
        User::query()
            ->whereIn('role', config('roles.staff_side'))
            ->where('is_active', true)
            ->pluck('id')
            ->each(fn (string $id) => $this->write($id, $title, $body, $booking?->id, $link));
    }

    public function sacramentLabel(Booking $booking): string
    {
        return $booking->service?->name ?? ucwords(str_replace('-', ' ', $booking->sacrament));
    }

    /**
     * Where this booking's emails go: the account's address, or the walk-in contact's unless their account was
     * deleted since. Null for no address, an invalid one, or the seeded demo addresses at example.com.
     */
    public function mailAddressFor(Booking $booking): ?string
    {
        $address = $booking->user_id !== null
            ? $booking->user?->email
            : (data_get($booking->owner_snapshot, 'accountDeleted') ? null : data_get($booking->owner_snapshot, 'email'));

        return $this->deliverable($address) ? $address : null;
    }

    /** The booking's page in the parishioner app. */
    public function bookingUrl(Booking $booking): string
    {
        return $this->appUrl()."/booking/history/{$booking->id}";
    }

    /** The public page where a certificate is checked. */
    public function verifyUrl(): string
    {
        return $this->appUrl().'/verify';
    }

    /** The parishioner's wallet, where their certificates and certificate requests are listed. */
    public function walletUrl(): string
    {
        return $this->appUrl().'/wallet';
    }

    private function deliverable(?string $address): bool
    {
        return is_string($address) && filter_var($address, FILTER_VALIDATE_EMAIL) !== false
            && ! str_ends_with(strtolower($address), '@example.com');
    }

    private function appUrl(): string
    {
        return rtrim((string) config('app.parishioner_url'), '/');
    }

    /**
     * Queues the email once the surrounding transaction commits (at once when there is none), so a rolled-back
     * action sends nothing. It must never break the action that asked for it, so a failure, including the queue
     * push that runs at commit time, is logged and swallowed inside the callback.
     */
    private function send(string $address, string $subject, string $name, string $body, ?string $label, ?string $url): void
    {
        $first = trim(strtok(trim($name), ' ') ?: '') ?: 'there';

        DB::afterCommit(function () use ($address, $subject, $first, $body, $label, $url) {
            try {
                Mail::to($address)->queue(new BookingMail($subject, $first, [$body], $label, $url));
            } catch (\Throwable $e) {
                // The address is left out of the log on purpose.
                Log::warning('Could not queue a status email.', ['subject' => $subject, 'error' => $e->getMessage()]);
            }
        });
    }

    private function write(string $userId, string $title, string $body, ?string $bookingId = null, ?string $link = null): void
    {
        AppNotification::create([
            'user_id' => $userId,
            'booking_id' => $bookingId,
            'link' => $link,
            'title' => $title,
            'body' => $body,
            'category' => 'today',
            'read' => false,
            'icon' => 'booking',
        ]);
    }
}
