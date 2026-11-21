<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** A service as the Settings screen edits it. Session fields are null for a service without fixed sessions. */
class AdminServiceResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $sessions = $this->hasSessions();

        return [
            'id' => $this->id,
            'name' => $this->name,
            'description' => $this->description,
            'feeRule' => $this->fee_rule,
            'priceCentavos' => $this->price_centavos,
            'durationMinutes' => $this->duration_minutes,
            'offsite' => (bool) $this->offsite,
            'allowedWeekdays' => $this->allowed_weekdays,
            'leadTimeDays' => $this->lead_time_days,
            'dailyCapacity' => $this->daily_capacity,
            'hasSessions' => $sessions,
            'sessionWeekdays' => $sessions ? $this->session_weekdays : null,
            'sessionTimes' => $sessions ? $this->session_times : null,
            'sessionCapacity' => $sessions ? $this->session_capacity : null,
            'sessionDurationMinutes' => $sessions ? $this->session_duration_minutes : null,
            'sponsorFeeAllowed' => in_array($this->id, ['baptism', 'confirmation', 'wedding'], true),
        ];
    }
}
