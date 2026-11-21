<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AuditLogResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'action' => $this->action,
            'subjectType' => $this->subject_type,
            'subjectId' => $this->subject_id,
            'metadata' => $this->metadata ?? new \stdClass(),
            // Falls back to the name/email denormalized into metadata at
            // write time when the actor relation is null — the actor user
            // was deleted (actor_user_id is nullOnDelete), but the log entry
            // should still say who did this, not just "unknown".
            'actor' => [
                'id' => $this->actor?->id,
                'fullName' => $this->actor?->full_name ?? ($this->metadata['actorName'] ?? null),
                'email' => $this->actor?->email ?? ($this->metadata['actorEmail'] ?? null),
            ],
            'createdAt' => $this->created_at?->toISOString(),
        ];
    }
}
