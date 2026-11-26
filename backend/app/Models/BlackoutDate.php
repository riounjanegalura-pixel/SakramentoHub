<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BlackoutDate extends Model
{
    protected $fillable = ['date', 'reason', 'start_time', 'end_time', 'sacraments'];

    protected function casts(): array
    {
        return ['date' => 'date:Y-m-d', 'sacraments' => 'array'];
    }

    public function appliesTo(string $sacrament): bool
    {
        return $this->sacraments === null || in_array($sacrament, $this->sacraments, true);
    }

    /** A closure with a time window shuts only that window. Without one it shuts the whole day. */
    public function isTimed(): bool
    {
        return $this->start_time !== null && $this->end_time !== null;
    }

    /** The closed window as minutes from midnight, or null for a whole-day closure. @return array{0:int,1:int}|null */
    public function window(): ?array
    {
        if (! $this->isTimed()) {
            return null;
        }
        [$sh, $sm] = array_map('intval', explode(':', $this->start_time));
        [$eh, $em] = array_map('intval', explode(':', $this->end_time));

        return [$sh * 60 + $sm, $eh * 60 + $em];
    }
}
