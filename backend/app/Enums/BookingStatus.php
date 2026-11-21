<?php

namespace App\Enums;

enum BookingStatus: string
{
    case Draft = 'draft';
    case Submitted = 'submitted';
    case Returned = 'returned';
    case Approved = 'approved';
    case Completed = 'completed';
    case Declined = 'declined';
    case Cancelled = 'cancelled';

    private const TRANSITIONS = [
        'draft' => ['submitted', 'cancelled'],
        'submitted' => ['returned', 'approved', 'declined', 'cancelled'],
        'returned' => ['submitted', 'declined', 'cancelled'],
        'approved' => ['submitted', 'completed', 'cancelled'],
        'completed' => [],
        'declined' => [],
        'cancelled' => [],
    ];

    public function isOpen(): bool
    {
        return in_array($this, [self::Draft, self::Submitted, self::Returned, self::Approved], true);
    }

    public function holdsSlot(): bool
    {
        return in_array($this, [self::Submitted, self::Returned, self::Approved, self::Completed], true);
    }

    public function canTransitionTo(self $to): bool
    {
        return in_array($to->value, self::TRANSITIONS[$this->value], true);
    }

    public function label(): string
    {
        return match ($this) {
            self::Draft => 'Draft',
            self::Submitted => 'Awaiting review',
            self::Returned => 'Needs changes',
            self::Approved => 'Approved',
            self::Completed => 'Completed',
            self::Declined => 'Declined',
            self::Cancelled => 'Cancelled',
        };
    }

    /** @return list<string> */
    public static function values(): array
    {
        return array_map(fn (self $s) => $s->value, self::cases());
    }
}
