<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AppNotificationResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'title' => $this->title,
            'body' => $this->body,
            // Computed from created_at HERE, at read time — not the stored
            // `category` column, which the migration's own comment already
            // flagged as a shortcut ("computed from created_at at read time
            // in a real system; stored directly here to match the mock's
            // seed shape for now"). Storing it meant every notification was
            // permanently frozen as whatever category it was created under —
            // an approval from six weeks ago still showed under "Today".
            'category' => $this->created_at?->isToday() ? 'today' : 'earlier',
            'read' => $this->read,
            'icon' => $this->icon,
            'bookingId' => $this->booking_id,
            'link' => $this->link,
            'createdAt' => $this->created_at?->toISOString(),
        ];
    }
}
