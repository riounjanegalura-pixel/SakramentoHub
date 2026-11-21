<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class AppNotification extends Model
{
    use HasFactory, HasUuids;

    protected $table = 'notifications';

    protected $fillable = ['user_id', 'booking_id', 'title', 'body', 'category', 'read', 'icon', 'link'];

    protected function casts(): array
    {
        return ['read' => 'boolean'];
    }
}
