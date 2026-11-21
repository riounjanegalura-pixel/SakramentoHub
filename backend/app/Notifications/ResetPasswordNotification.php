<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * Replaces the framework default (Illuminate\Auth\Notifications\ResetPassword),
 * which links to a Laravel named route ('password.reset') that doesn't exist
 * here — this is an API-only backend with two separate SPA frontends. Built
 * with MAIL_MAILER=log in mind: in this environment the "email" this
 * generates is written straight to storage/logs/laravel.log, never actually
 * sent — that's the intended zero-cost demo path, not a bug.
 */
class ResetPasswordNotification extends Notification
{
    use Queueable;

    public function __construct(private readonly string $token)
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
            ->subject('Reset Your SakramentoHub Password')
            ->line('You (or someone else) requested a password reset for this account.')
            ->action('Reset Password', $this->resetUrl($notifiable))
            ->line('This link expires in 60 minutes.')
            ->line('If you did not request a password reset, no further action is required.');
    }

    private function resetUrl(object $notifiable): string
    {
        $email = method_exists($notifiable, 'getEmailForPasswordReset')
            ? $notifiable->getEmailForPasswordReset()
            : $notifiable->email;

        $baseUrl = $this->frontendBaseUrl($notifiable);

        return sprintf(
            '%s/reset-password?token=%s&email=%s',
            rtrim($baseUrl, '/'),
            $this->token,
            urlencode($email)
        );
    }

    /**
     * Staff/admin accounts are provisioned by an admin and only ever sign in
     * through the admin portal, so their reset link must point there instead
     * of the parishioner PWA.
     */
    private function frontendBaseUrl(object $notifiable): string
    {
        $role = $notifiable->role ?? null;

        return in_array($role, config('roles.staff_side'), true)
            ? config('app.admin_url')
            : config('app.parishioner_url');
    }
}
