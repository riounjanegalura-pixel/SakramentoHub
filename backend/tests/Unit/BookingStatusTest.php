<?php

use App\Enums\BookingStatus as S;
use App\Enums\PaymentStatus as P;

test('open statuses are draft, submitted, returned and approved', function () {
    $open = array_values(array_filter(S::cases(), fn (S $s) => $s->isOpen()));
    expect($open)->toBe([S::Draft, S::Submitted, S::Returned, S::Approved]);
});

test('slot-holding statuses exclude draft and terminal ones', function () {
    $holding = array_values(array_filter(S::cases(), fn (S $s) => $s->holdsSlot()));
    expect($holding)->toBe([S::Submitted, S::Returned, S::Approved, S::Completed]);
});

test('allowed transitions match the spec state machine', function () {
    $allowed = [
        'draft' => ['submitted', 'cancelled'],
        'submitted' => ['returned', 'approved', 'declined', 'cancelled'],
        'returned' => ['submitted', 'declined', 'cancelled'],
        'approved' => ['submitted', 'completed', 'cancelled'],
        'completed' => [],
        'declined' => [],
        'cancelled' => [],
    ];
    foreach (S::cases() as $from) {
        foreach (S::cases() as $to) {
            expect($from->canTransitionTo($to))
                ->toBe(in_array($to->value, $allowed[$from->value], true), "{$from->value} -> {$to->value}");
        }
    }
});

test('labels use parish wording', function () {
    expect(S::Declined->label())->toBe('Declined')
        ->and(S::Returned->label())->toBe('Needs changes')
        ->and(S::Submitted->label())->toBe('Awaiting review')
        ->and(P::RefundDue->label())->toBe('Refund due')
        ->and(P::NotRequired->label())->toBe('No fee');
});

test('values() lists every backing value', function () {
    expect(S::values())->toBe(['draft', 'submitted', 'returned', 'approved', 'completed', 'declined', 'cancelled'])
        ->and(P::values())->toBe(['not_required', 'unpaid', 'pending_cash', 'paid', 'refund_due', 'refunded', 'void']);
});
