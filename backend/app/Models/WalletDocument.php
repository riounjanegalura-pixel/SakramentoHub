<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A document a parishioner keeps for reuse across bookings. Private to its owner. */
class WalletDocument extends Model
{
    use HasFactory, HasUuids;

    public const KINDS = ['birth_certificate', 'baptismal_certificate', 'confirmation_certificate', 'marriage_contract', 'cenomar', 'death_certificate', 'other'];

    public const LIMIT = 30;

    protected $fillable = ['user_id', 'kind', 'person_name', 'file_url', 'original_name', 'mime', 'size_bytes'];

    protected function casts(): array
    {
        return ['size_bytes' => 'integer'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
