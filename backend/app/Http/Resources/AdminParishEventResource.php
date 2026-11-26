<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Admin-facing shape adds creator info the public ParishEventResource has no
 * reason to expose (parishioners don't need to know which staff member
 * posted an announcement) — same reasoning as AdminBookingResource vs
 * BookingResource differing on exposing internals only staff need.
 */
class AdminParishEventResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'title' => $this->title,
            'date' => $this->date->toISOString(),
            'location' => $this->location,
            'imageUrl' => $this->image_url,
            'category' => $this->category,
            'durationMinutes' => (int) $this->duration_minutes,
            'blocksBookings' => (bool) $this->blocks_bookings,
            'createdBy' => $this->created_by,
            'createdByName' => $this->creatorName(),
            'createdAt' => $this->created_at?->toISOString(),
            'updatedAt' => $this->updated_at?->toISOString(),
        ];
    }
}
