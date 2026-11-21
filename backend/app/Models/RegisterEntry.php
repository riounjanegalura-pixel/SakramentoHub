<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RegisterEntry extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'sacrament', 'year', 'sequence', 'register_number', 'verify_code', 'booking_id', 'source',
        'subject_name', 'ceremony_date', 'book_no', 'page_no', 'line_no', 'snapshot', 'status',
        'revoked_reason', 'revoked_by', 'revoked_at', 'corrected_at', 'entered_by',
    ];

    protected function casts(): array
    {
        return [
            'snapshot' => 'array',
            'year' => 'integer',
            'sequence' => 'integer',
            'ceremony_date' => 'date',
            'revoked_at' => 'datetime',
            'corrected_at' => 'datetime',
        ];
    }

    public function booking(): BelongsTo
    {
        return $this->belongsTo(Booking::class);
    }

    public function enteredBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'entered_by');
    }

    public function revokedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'revoked_by');
    }
}
