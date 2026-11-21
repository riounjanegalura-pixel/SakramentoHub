<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/**
 * A gift to the parish paid through a PayMongo GCash checkout. 'pending' until the signed webhook says it was paid;
 * the browser coming back from PayMongo is never proof of payment.
 */
class Donation extends Model
{
    use HasUuids;

    public const MIN_CENTAVOS = 2000;       // PayMongo's GCash minimum is PHP 20
    public const MAX_CENTAVOS = 10_000_000; // PHP 100,000 in one gift

    protected $fillable = ['user_id', 'amount_centavos', 'status', 'paymongo_checkout_session_id', 'paymongo_payment_id', 'paid_at'];

    protected function casts(): array
    {
        return ['paid_at' => 'datetime', 'amount_centavos' => 'integer'];
    }

    /** What PayMongo shows the donor and puts on the receipt. */
    public function reference(): string
    {
        return 'DON-'.strtoupper(substr(str_replace('-', '', $this->id), 0, 8));
    }
}
