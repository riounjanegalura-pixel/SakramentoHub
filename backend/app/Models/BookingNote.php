<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** A staff-only note on a booking. Append-only: there is no update or delete path. */
class BookingNote extends Model
{
    public $timestamps = false;

    protected $fillable = ['booking_id', 'author_id', 'body', 'created_at'];

    protected function casts(): array
    {
        return ['created_at' => 'datetime'];
    }

    public function author()
    {
        return $this->belongsTo(User::class, 'author_id');
    }
}
