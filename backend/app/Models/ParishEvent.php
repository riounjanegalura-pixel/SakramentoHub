<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class ParishEvent extends Model
{
    use HasUuids;

    protected $fillable = ['title', 'date', 'location', 'image_url', 'category', 'created_by', 'duration_minutes'];

    protected function casts(): array
    {
        return ['date' => 'datetime', 'duration_minutes' => 'integer'];
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /**
     * No `creator_snapshot` denormalized column, unlike Booking::ownerName()'s
     * fallback to `owner_snapshot`. That precedent exists because a
     * booking's whole point is "who is this for" — losing the name entirely
     * once the owner account is deleted would make the record meaningless.
     * A parish event's title/date/location/category don't depend on who
     * posted it to stay meaningful, so once `created_by` goes null (the
     * user was deleted — see the nullOnDelete FK), there is genuinely
     * nothing left worth preserving beyond "creator unknown". This just
     * returns null in that case rather than a stale name.
     */
    public function creatorName(): ?string
    {
        return $this->creator?->full_name;
    }
}
