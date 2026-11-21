<?php

namespace App\Services\Payment;

use App\Models\User;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Throwable;

/**
 * The one-time code of the simulated GCash screen: a real code, really sent, checked on the server.
 * Stored only as an HMAC for 5 minutes, five tries, one fresh code per 30 seconds.
 * Goes by SMS (a TextBee phone) to the mobile number entered when it is configured; otherwise to the account's email.
 */
class OneTimeCode
{
    public const TTL_SECONDS = 300;
    public const MAX_ATTEMPTS = 5;
    public const RESEND_SECONDS = 30;

    /** @return array{channel: string, to: string}|null null while the resend cooldown is running */
    public function send(string $booking, User $user, string $mobile): ?array
    {
        if (Cache::has($this->key($booking, 'cooldown'))) {
            return null;
        }

        $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        $message = "Your SakramentoHub payment code is {$code}. It expires in 5 minutes. Never share it with anyone.";

        // SMS through a TextBee phone (a plain SIM: no Sender ID, any network). If it is not set up, or the phone is
        // offline or refuses it, the code is emailed instead, and the reply says it went to the email.
        $sms = false;
        if (filled(config('services.textbee.api_key'))) {
            try {
                $this->textbee($mobile, $message);
                $sms = true;
            } catch (OneTimeCodeException) {
                // Already logged with the reason; fall through to email.
            }
        }
        if (! $sms) {
            $this->email($user, $message);
        }

        Cache::put($this->key($booking, 'code'), ['hash' => $this->hash($booking, $code), 'attempts' => 0], self::TTL_SECONDS);
        Cache::put($this->key($booking, 'cooldown'), true, self::RESEND_SECONDS);

        return $sms
            ? ['channel' => 'sms', 'to' => substr($mobile, 0, 4).'***'.substr($mobile, -3)]
            : ['channel' => 'email', 'to' => $this->maskEmail($user->email)];
    }

    /** @return string 'ok', 'wrong', 'expired' or 'locked' */
    public function check(string $booking, string $code): string
    {
        $entry = Cache::get($this->key($booking, 'code'));
        if (! $entry) {
            return 'expired';
        }
        if ($entry['attempts'] >= self::MAX_ATTEMPTS) {
            return 'locked';
        }
        if (hash_equals($entry['hash'], $this->hash($booking, $code))) {
            Cache::forget($this->key($booking, 'code'));

            return 'ok';
        }
        $entry['attempts']++;
        Cache::put($this->key($booking, 'code'), $entry, self::TTL_SECONDS);

        return $entry['attempts'] >= self::MAX_ATTEMPTS ? 'locked' : 'wrong';
    }

    /** TextBee: your own Android phone and SIM send the text, so it reaches any network and needs no Sender ID. */
    private function textbee(string $mobile, string $message): void
    {
        $base = rtrim((string) config('services.textbee.base_url'), '/');
        $device = config('services.textbee.device_id');
        $path = filled($device) ? "/gateway/devices/{$device}/send-sms" : '/gateway/send-sms';

        try {
            $response = Http::withHeaders(['x-api-key' => (string) config('services.textbee.api_key')])
                ->timeout(20)
                ->post($base.$path, ['recipients' => ['+63'.substr($mobile, 1)], 'message' => $message]);
        } catch (ConnectionException $e) {
            Log::warning('TextBee could not be reached.', ['error' => $e->getMessage()]);
            throw new OneTimeCodeException('We could not send the code by SMS. Please try again.', 0, $e);
        }
        if ($response->failed()) {
            Log::warning('TextBee could not send the payment code.', ['status' => $response->status(), 'body' => $response->json()]);
            throw new OneTimeCodeException('We could not send the code by SMS. Please try again.');
        }
    }

    private function email(User $user, string $message): void
    {
        try {
            Mail::raw($message, fn ($m) => $m->to($user->email)->subject('Your SakramentoHub payment code'));
        } catch (Throwable $e) {
            Log::warning('Could not email the payment code.', ['error' => $e->getMessage()]);
            throw new OneTimeCodeException('We could not email the code. Please try again.', 0, $e);
        }
    }

    private function hash(string $booking, string $code): string
    {
        return hash_hmac('sha256', "{$booking}|{$code}", (string) config('app.key'));
    }

    private function key(string $booking, string $part): string
    {
        return "sim-pay-otp:{$booking}:{$part}";
    }

    private function maskEmail(string $email): string
    {
        [$name, $domain] = array_pad(explode('@', $email, 2), 2, '');

        return substr($name, 0, 2).'***@'.$domain;
    }
}
