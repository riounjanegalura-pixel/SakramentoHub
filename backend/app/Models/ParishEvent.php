<?php

namespace App\Models;

use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class ParishEvent extends Model
{
    use HasUuids;

    protected $fillable = ['title', 'date', 'location', 'image_url', 'category', 'created_by', 'duration_minutes', 'blocks_bookings'];

    protected function casts(): array
    {
        return ['date' => 'datetime', 'duration_minutes' => 'integer', 'blocks_bookings' => 'boolean'];
    }

    /**
     * Events that fall inside the given parish-time days (inclusive), whatever zone the database keeps them in. An event is
     * stored as a real instant, so "the 25th" is the parish day's own start and end converted, never the stored date part.
     */
    public function scopeBetweenParishDays(Builder $query, string $firstDay, string $lastDay): Builder
    {
        $zone = config('app.parish_timezone', 'Asia/Manila');
        $from = CarbonImmutable::parse($firstDay, $zone)->startOfDay()->setTimezone(config('app.timezone'));
        $to = CarbonImmutable::parse($lastDay, $zone)->addDay()->startOfDay()->setTimezone(config('app.timezone'));

        return $query->where('date', '>=', $from)->where('date', '<', $to);
    }

    /** When the event starts, on the parish clock: what the office typed and what a parishioner reads. */
    public function parishTime(): CarbonImmutable
    {
        return CarbonImmutable::parse($this->date)->setTimezone(config('app.parish_timezone', 'Asia/Manila'));
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
