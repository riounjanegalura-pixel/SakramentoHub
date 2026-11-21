<?php

namespace App\Models;

use App\Support\ParishClock;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

/** A parishioner's request for a copy of a past register record. It holds no record data until staff issue it. */
class CertificateRequest extends Model
{
    use HasFactory, HasUuids;

    public const RELATIONSHIPS = ['self', 'parent', 'child', 'spouse', 'sibling', 'representative'];

    public const STATUSES = ['submitted', 'issued', 'declined', 'cancelled'];

    /** The most open requests one account may have at a time. */
    public const OPEN_LIMIT = 5;

    protected $fillable = [
        'reference_number', 'user_id', 'owner_snapshot', 'sacrament', 'person_name', 'sacrament_date_text', 'details',
        'relationship', 'purpose', 'id_url', 'letter_url', 'status', 'decline_reason', 'register_entry_id',
        'handled_by', 'closed_at', 'files_removed_at',
    ];

    protected function casts(): array
    {
        return [
            'owner_snapshot' => 'array',
            'details' => 'array',
            'closed_at' => 'datetime',
            'files_removed_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (CertificateRequest $request) {
            if (! $request->reference_number) {
                $request->reference_number = static::generateReferenceNumber();
            }
        });
    }

    /** `CERT-{YYYYMMDD}-{4 random chars}` dated by the parish day, retried against a uniqueness check. */
    public static function generateReferenceNumber(): string
    {
        $day = ParishClock::now()->format('Ymd');

        do {
            $candidate = sprintf('CERT-%s-%s', $day, strtoupper(Str::random(4)));
        } while (static::where('reference_number', $candidate)->exists());

        return $candidate;
    }

    public function scopeOpen($query)
    {
        return $query->where('status', 'submitted');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function registerEntry(): BelongsTo
    {
        return $this->belongsTo(RegisterEntry::class);
    }

    public function handler(): BelongsTo
    {
        return $this->belongsTo(User::class, 'handled_by');
    }

    /** Who asked: the account, or what was kept of it once the account is deleted. */
    public function requesterName(): ?string
    {
        return $this->user?->full_name ?? data_get($this->owner_snapshot, 'fullName');
    }

    public function requesterEmail(): ?string
    {
        return $this->user?->email ?? data_get($this->owner_snapshot, 'email');
    }

    public function requesterPhone(): ?string
    {
        return $this->user?->phone ?: data_get($this->owner_snapshot, 'phone');
    }
}
