<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ServiceResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'sacrament' => $this->sacrament,
            'name' => $this->name,
            'description' => $this->description,
            'priceCentavos' => $this->price_centavos,
            'feeRule' => $this->fee_rule,
            'durationMinutes' => $this->duration_minutes,
            'offsite' => (bool) $this->offsite,
            'allowedWeekdays' => $this->allowed_weekdays ?? [],
            'leadTimeDays' => $this->lead_time_days,
            'dailyCapacity' => $this->daily_capacity,
            'sessionWeekdays' => $this->session_weekdays,
            'sessionTimes' => $this->session_times,
            'sessionCapacity' => $this->session_capacity,
        ];
    }
}
