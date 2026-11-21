<?php

namespace App\Services\Booking;

use App\Models\AuditLog;
use App\Models\Booking;
use App\Models\User;

class BookingAudit
{
    public function record(?User $actor, string $action, Booking $booking, array $metadata = []): void
    {
        AuditLog::create([
            'actor_user_id' => $actor?->id,
            'action' => $action,
            'subject_type' => 'booking',
            'subject_id' => $booking->id,
            'metadata' => array_merge($metadata, [
                'actorName' => $actor?->full_name ?? 'System',
                'actorEmail' => $actor?->email,
                'reference' => $booking->reference_number,
            ]),
            'created_at' => now(),
        ]);
    }
}
