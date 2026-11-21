<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** A wedding preparation step a staff member ticked by hand. Steps the system works out itself are never stored. */
class BookingMilestone extends Model
{
    protected $fillable = ['booking_id', 'key', 'done_at', 'done_by', 'note', 'data'];

    protected function casts(): array
    {
        return [
            'done_at' => 'datetime',
            'data' => 'array',
        ];
    }

    public function doneByUser()
    {
        return $this->belongsTo(User::class, 'done_by');
    }
}
