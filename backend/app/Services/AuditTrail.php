<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\User;

/** Audit entries for anything that is not a booking (settings, blackout dates, report exports). */
class AuditTrail
{
    public function record(?User $actor, string $action, string $subjectType, string $subjectId, array $metadata = []): void
    {
        AuditLog::create([
            'actor_user_id' => $actor?->id,
            'action' => $action,
            'subject_type' => $subjectType,
            'subject_id' => $subjectId,
            'metadata' => $metadata + ['actorName' => $actor?->full_name ?? 'System', 'actorEmail' => $actor?->email],
            'created_at' => now(),
        ]);
    }
}
