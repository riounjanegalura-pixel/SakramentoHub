<?php

namespace App\Enums;

enum PaymentStatus: string
{
    case NotRequired = 'not_required';
    case Unpaid = 'unpaid';
    /** The parishioner will pay cash at the parish office; the slot stays held on the same deadline as `unpaid`. */
    case PendingCash = 'pending_cash';
    case Paid = 'paid';
    case RefundDue = 'refund_due';
    case Refunded = 'refunded';
    case Void = 'void';

    public function label(): string
    {
        return match ($this) {
            self::NotRequired => 'No fee',
            self::Unpaid => 'Unpaid',
            self::PendingCash => 'Cash at the parish office',
            self::Paid => 'Paid',
            self::RefundDue => 'Refund due',
            self::Refunded => 'Refunded',
            self::Void => 'Void',
        };
    }

    /** Waiting for money while the slot is held on a deadline: GCash or cash at the office. */
    public function awaitingPayment(): bool
    {
        return in_array($this, [self::Unpaid, self::PendingCash], true);
    }

    /** @return list<string> the awaitingPayment() values, for queries */
    public static function awaitingValues(): array
    {
        return [self::Unpaid->value, self::PendingCash->value];
    }

    /** @return list<string> */
    public static function values(): array
    {
        return array_map(fn (self $s) => $s->value, self::cases());
    }
}
