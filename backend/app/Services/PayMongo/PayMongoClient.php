<?php

namespace App\Services\PayMongo;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\Http;

/**
 * Thin wrapper over PayMongo's Checkout Sessions API
 * (https://docs.paymongo.com/reference/create-a-checkout).
 *
 * Auth is HTTP Basic with the secret key as the username and an empty
 * password. Request/response bodies use PayMongo's JSON:API-style
 * `{ data: { attributes: {...} } }` envelope. Amounts are integer centavos.
 *
 * Built on Laravel's Http client so tests can `Http::fake()` it — no SDK
 * dependency needed for the two calls this app makes.
 */
class PayMongoClient
{
    public function __construct(
        private readonly ?string $secretKey,
        private readonly string $baseUrl,
    ) {
    }

    public static function fromConfig(): self
    {
        return new self(config('paymongo.secret_key'), config('paymongo.base_url'));
    }

    public function isConfigured(): bool
    {
        return filled($this->secretKey);
    }

    /**
     * @param  array{
     *     amount_centavos: int,
     *     name: string,
     *     description: string,
     *     reference_number: string,
     *     statement_descriptor?: string,
     *     success_url: string,
     *     cancel_url: string,
     *     metadata: array<string, string>,
     *     billing?: array{name?: string, email?: string},
     * }  $params
     * @return array{id: string, checkout_url: string, status: string|null}
     */
    public function createCheckoutSession(array $params): array
    {
        // 'direct' (default): send the payer straight to GCash, with no PayMongo page in between (so no
        // "use a different payment method" link). 'checkout': PayMongo's hosted checkout page, kept as a fallback.
        if (config('paymongo.flow') === 'direct') {
            return $this->createGcashPayment($params);
        }

        $attributes = [
            'line_items' => [[
                'amount' => $params['amount_centavos'],
                'currency' => 'PHP',
                'name' => $params['name'],
                'quantity' => 1,
            ]],
            // GCash is the parish's only accepted method (client feedback).
            'payment_method_types' => ['gcash'],
            'description' => $params['description'],
            'reference_number' => $params['reference_number'],
            'success_url' => $params['success_url'],
            'cancel_url' => $params['cancel_url'],
            'send_email_receipt' => true,
            'show_description' => true,
            'show_line_items' => true,
            'metadata' => $params['metadata'],
        ];

        if (! empty($params['billing'])) {
            $attributes['billing'] = array_filter($params['billing']);
        }

        return $this->toSession($this->send('post', '/checkout_sessions', ['data' => ['attributes' => $attributes]]));
    }

    /**
     * A GCash payment without PayMongo's hosted page: a Payment Intent, a GCash payment method, then attach.
     * The attach call returns GCash's own authorization URL, where the payer enters their number, OTP and MPIN.
     * Returns the same shape as a checkout session so callers don't care which flow ran; `id` is the intent id.
     *
     * @return array{id: string, checkout_url: string, status: string|null}
     */
    private function createGcashPayment(array $params): array
    {
        $intent = $this->send('post', '/payment_intents', ['data' => ['attributes' => [
            'amount' => $params['amount_centavos'],
            'currency' => 'PHP',
            // GCash is the parish's only accepted method (client feedback).
            'payment_method_allowed' => ['gcash'],
            'capture_type' => 'automatic',
            'description' => $params['description'],
            'statement_descriptor' => mb_substr((string) ($params['statement_descriptor'] ?? 'Parish'), 0, 22),
            'metadata' => array_merge($params['metadata'], ['reference_number' => $params['reference_number']]),
        ]]]);
        $intentId = data_get($intent, 'data.id');
        $clientKey = data_get($intent, 'data.attributes.client_key');

        $billing = array_filter($params['billing'] ?? []);
        $method = $this->send('post', '/payment_methods', ['data' => ['attributes' => array_filter([
            'type' => 'gcash',
            'billing' => $billing ?: null,
        ])]]);

        $attached = $this->send('post', '/payment_intents/'.rawurlencode((string) $intentId).'/attach', ['data' => ['attributes' => [
            'payment_method' => data_get($method, 'data.id'),
            'client_key' => $clientKey,
            // GCash sends the payer here whether they paid or backed out; the page reads the real
            // payment status from our own server, which learns it from the signed webhook.
            'return_url' => $params['success_url'],
        ]]]);

        return $this->toIntent($attached);
    }

    /**
     * A QR Ph payment: a Payment Intent, a `qrph` payment method, then attach. The attach call returns the QR code as an
     * image (a base64 data URL) in `next_action.code.image_url`; the payer scans it with GCash, Maya or a bank app.
     * Paid is only ever known from the signed `payment.paid` webhook, same as the GCash flow.
     *
     * @return array{id: string, qr_image: string, status: string|null}
     */
    public function createQrphPayment(array $params): array
    {
        $intent = $this->send('post', '/payment_intents', ['data' => ['attributes' => [
            'amount' => $params['amount_centavos'],
            'currency' => 'PHP',
            'payment_method_allowed' => ['qrph'],
            'capture_type' => 'automatic',
            'description' => $params['description'],
            'statement_descriptor' => mb_substr((string) ($params['statement_descriptor'] ?? 'Parish'), 0, 22),
            'metadata' => array_merge($params['metadata'], ['reference_number' => $params['reference_number']]),
        ]]]);
        $intentId = data_get($intent, 'data.id');
        $clientKey = data_get($intent, 'data.attributes.client_key');

        $billing = array_filter($params['billing'] ?? []);
        $method = $this->send('post', '/payment_methods', ['data' => ['attributes' => array_filter([
            'type' => 'qrph',
            'expiry_seconds' => (int) config('paymongo.qrph_expiry_seconds', 1800),
            'billing' => $billing ?: null,
        ])]]);

        $attached = $this->send('post', '/payment_intents/'.rawurlencode((string) $intentId).'/attach', ['data' => ['attributes' => [
            'payment_method' => data_get($method, 'data.id'),
            'client_key' => $clientKey,
        ]]]);

        $result = $this->toIntent($attached, requireUrl: false);
        if (! $result['qr_image']) {
            throw new PayMongoException('PayMongo response is missing the QR Ph code.');
        }

        return ['id' => $result['id'], 'qr_image' => $result['qr_image'], 'status' => $result['status']];
    }

    /** @return array{id: string, checkout_url: string, status: string|null, qr_image: string|null} */
    public function retrieveCheckoutSession(string $id): array
    {
        if (str_starts_with($id, 'pi_')) {
            return $this->toIntent($this->send('get', '/payment_intents/'.rawurlencode($id)), requireUrl: false);
        }

        return $this->toSession($this->send('get', '/checkout_sessions/'.rawurlencode($id)));
    }

    /** Stops a still-open payment from accepting a late payment. */
    public function expireCheckoutSession(string $id): void
    {
        if (str_starts_with($id, 'pi_')) {
            $this->send('post', '/payment_intents/'.rawurlencode($id).'/cancel');

            return;
        }

        $this->send('post', '/checkout_sessions/'.rawurlencode($id).'/expire');
    }

    private function send(string $method, string $path, array $body = []): array
    {
        if (! $this->isConfigured()) {
            throw new PayMongoException('PayMongo secret key is not configured.');
        }

        try {
            $response = $this->http()->{$method}($path, $method === 'get' ? null : $body);
        } catch (ConnectionException $e) {
            throw new PayMongoException('Could not reach PayMongo: '.$e->getMessage(), 0, $e);
        }

        if ($response->failed()) {
            $detail = $response->json('errors.0.detail') ?? $response->body();
            throw new PayMongoException("PayMongo returned HTTP {$response->status()}: {$detail}");
        }

        return $response->json() ?? [];
    }

    private function toSession(array $json): array
    {
        $id = data_get($json, 'data.id');
        $url = data_get($json, 'data.attributes.checkout_url');

        if (! $id || ! $url) {
            throw new PayMongoException('PayMongo response is missing the checkout session id or URL.');
        }

        return ['id' => $id, 'checkout_url' => $url, 'status' => data_get($json, 'data.attributes.status')];
    }

    /** A payment intent as a session: `active` while it still waits for the payer at GCash. */
    private function toIntent(array $json, bool $requireUrl = true): array
    {
        $id = data_get($json, 'data.id');
        $url = data_get($json, 'data.attributes.next_action.redirect.url');
        $qr = data_get($json, 'data.attributes.next_action.code.image_url');
        $status = data_get($json, 'data.attributes.status');

        if (! $id || ($requireUrl && ! $url)) {
            throw new PayMongoException('PayMongo response is missing the payment id or GCash URL.');
        }

        return [
            'id' => $id,
            'checkout_url' => (string) $url,
            'qr_image' => $qr ? (string) $qr : null,
            'status' => $status === 'awaiting_next_action' && ($url || $qr) ? 'active' : $status,
        ];
    }

    private function http(): PendingRequest
    {
        return Http::baseUrl(rtrim($this->baseUrl, '/'))
            ->withBasicAuth((string) $this->secretKey, '')
            ->acceptJson()
            ->asJson()
            ->timeout(15);
    }
}
