<?php

namespace Database\Seeders;

final class ServiceSchedulingDefaults
{
    /** ISO weekdays: 1 = Mon … 7 = Sun. Baptism: special appointments Tue–Sat, regular session Sunday 10:00. */
    public const BY_SERVICE = [
        'baptism' => ['fee_rule' => 'per_sponsor', 'duration_minutes' => 45, 'offsite' => false, 'allowed_weekdays' => [2, 3, 4, 5, 6], 'lead_time_days' => 7, 'daily_capacity' => null, 'session_weekdays' => [7], 'session_times' => ['10:00'], 'session_capacity' => 10, 'session_duration_minutes' => 60],
        'confirmation' => ['fee_rule' => 'none', 'duration_minutes' => 60, 'offsite' => false, 'allowed_weekdays' => [2, 3, 4, 5, 6], 'lead_time_days' => 14, 'daily_capacity' => null, 'session_weekdays' => null, 'session_times' => null, 'session_capacity' => null, 'session_duration_minutes' => null],
        'wedding' => ['fee_rule' => 'flat', 'duration_minutes' => 90, 'offsite' => false, 'allowed_weekdays' => [2, 3, 4, 5, 6], 'lead_time_days' => 2, 'daily_capacity' => 2, 'session_weekdays' => null, 'session_times' => null, 'session_capacity' => null, 'session_duration_minutes' => null],
        'funeral' => ['fee_rule' => 'none', 'duration_minutes' => 60, 'offsite' => false, 'allowed_weekdays' => [1, 2, 3, 4, 5, 6, 7], 'lead_time_days' => 0, 'daily_capacity' => null, 'session_weekdays' => null, 'session_times' => null, 'session_capacity' => null, 'session_duration_minutes' => null],
        'anointing' => ['fee_rule' => 'none', 'duration_minutes' => 30, 'offsite' => true, 'allowed_weekdays' => [1, 2, 3, 4, 5, 6, 7], 'lead_time_days' => 0, 'daily_capacity' => null, 'session_weekdays' => null, 'session_times' => null, 'session_capacity' => null, 'session_duration_minutes' => null],
        'house-blessing' => ['fee_rule' => 'none', 'duration_minutes' => 45, 'offsite' => true, 'allowed_weekdays' => [2, 3, 4, 5, 6], 'lead_time_days' => 3, 'daily_capacity' => null, 'session_weekdays' => null, 'session_times' => null, 'session_capacity' => null, 'session_duration_minutes' => null],
    ];
}
