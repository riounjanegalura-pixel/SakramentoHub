<?php

namespace App\Mail;

use App\Models\ParishSetting;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * One plain status email: a greeting, a few lines and at most one button. It holds only text the caller already
 * wrote for the in-app notification, never booking data. Queued by BookingNotifier, which defers the push until the
 * surrounding transaction commits and swallows a failure of it.
 */
class BookingMail extends Mailable implements ShouldQueue
{
    use Queueable, SerializesModels;

    public $tries = 3;

    /** Wait a minute before the mail server is tried again. */
    public $backoff = 60;

    /** @param list<string> $lines */
    public function __construct(
        public string $subjectLine,
        public string $greetingName,
        public array $lines,
        public ?string $actionLabel,
        public ?string $actionUrl,
    ) {
    }

    public function envelope(): Envelope
    {
        return new Envelope(subject: $this->subjectLine);
    }

    public function content(): Content
    {
        return new Content(
            view: 'mail.booking',
            text: 'mail.booking-text',
            with: ['parishName' => ParishSetting::parishName()],
        );
    }
}
