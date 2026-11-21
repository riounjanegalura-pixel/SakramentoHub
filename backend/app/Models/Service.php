<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Service extends Model
{
    protected $keyType = 'string';
    public $incrementing = false;

    protected $fillable = [
        'id', 'sacrament', 'name', 'description', 'price_centavos', 'fee_rule', 'duration_minutes',
        'offsite', 'allowed_weekdays', 'lead_time_days', 'daily_capacity', 'session_weekdays',
        'session_times', 'session_capacity', 'session_duration_minutes',
    ];

    protected function casts(): array
    {
        return [
            'price_centavos' => 'integer',
            'duration_minutes' => 'integer',
            'offsite' => 'boolean',
            'allowed_weekdays' => 'array',
            'lead_time_days' => 'integer',
            'daily_capacity' => 'integer',
            'session_weekdays' => 'array',
            'session_times' => 'array',
            'session_capacity' => 'integer',
            'session_duration_minutes' => 'integer',
        ];
    }

    public function hasSessions(): bool
    {
        return ! empty($this->session_times);
    }

    /**
     * Inverse of `Booking::service()` — every booking whose `sacrament`
     * references this row. RESTRICT is the FK's delete behavior (see the
     * 2026_09_05_060000 migration), so this relationship existing with rows
     * is exactly why a service can't be deleted out from under them.
     */
    public function bookings()
    {
        return $this->hasMany(Booking::class, 'sacrament');
    }
}
