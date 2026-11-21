<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BlackoutDate extends Model
{
    protected $fillable = ['date', 'reason', 'sacraments'];

    protected function casts(): array
    {
        return ['date' => 'date:Y-m-d', 'sacraments' => 'array'];
    }

    public function appliesTo(string $sacrament): bool
    {
        return $this->sacraments === null || in_array($sacrament, $this->sacraments, true);
    }
}
