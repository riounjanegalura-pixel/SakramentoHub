<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * Only parishioners self-register through /api/register (see AuthController)
 * — staff/admin accounts are provisioned directly and treated as
 * pre-verified/trusted — so this always links at the parishioner PWA, unlike
 * ResetPasswordNotification which branches by role. Same zero-cost log-mailer
 * demo path as password reset: this "email" is written to
 * storage/logs/laravel.log, not actually sent.
 */
class VerifyEmailNotification extends Notification
{
    use Queueable;

    public function __construct(private readonly string $token, private readonly string $code = '')
    {
    }

    /**
     * @return array<int, string>
     */
    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject('Verify Your SakramentoHub Email')
            ->line('Please verify your email address to unlock submitting sacrament bookings.')
            ->line($this->code !== '' ? "Your code is **{$this->code}**. Type it on the Check your email screen in the app." : '')
            ->line('Or use the button below.')
            ->action('Verify Email', $this->verifyUrl($notifiable))
            ->line('This link expires in 60 minutes.')
            ->line('If you did not create this account, no further action is required.');
    }

    private function verifyUrl(object $notifiable): string
    {
        $baseUrl = rtrim(config('app.parishioner_url'), '/');

        return sprintf(
            '%s/verify-email?token=%s&email=%s',
            $baseUrl,
            $this->token,
            urlencode($notifiable->email)
        );
    }
}
