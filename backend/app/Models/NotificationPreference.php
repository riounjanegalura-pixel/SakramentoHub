<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class NotificationPreference extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = ['user_id', 'push_enabled', 'booking_reminders', 'parish_announcements'];

    protected function casts(): array
    {
        return [
            'push_enabled' => 'boolean',
            'booking_reminders' => 'boolean',
            'parish_announcements' => 'boolean',
        ];
    }
}
