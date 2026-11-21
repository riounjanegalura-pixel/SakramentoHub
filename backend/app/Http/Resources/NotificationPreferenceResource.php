<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class NotificationPreferenceResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'pushEnabled' => $this->push_enabled,
            'bookingReminders' => $this->booking_reminders,
            'parishAnnouncements' => $this->parish_announcements,
        ];
    }
}
