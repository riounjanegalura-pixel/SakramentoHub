<?php

namespace App\Casts;

use Illuminate\Contracts\Database\Eloquent\CastsAttributes;
use Illuminate\Database\Eloquent\Model;

class AsPlainObjectJson implements CastsAttributes
{
    public function get(Model $model, string $key, mixed $value, array $attributes): array
    {
        return $value === null ? [] : json_decode($value, true);
    }

    public function set(Model $model, string $key, mixed $value, array $attributes): string
    {
        // JSON_FORCE_OBJECT guarantees `{}` for an empty array instead of `[]`.
        return json_encode($value ?? [], JSON_FORCE_OBJECT);
    }
}
