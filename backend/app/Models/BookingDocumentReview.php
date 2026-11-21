<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BookingDocumentReview extends Model
{
    protected $fillable = ['booking_id', 'document_key', 'file_url', 'status', 'note', 'reviewed_by'];

    public function reviewer()
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }
}
