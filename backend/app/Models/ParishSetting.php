<?php

namespace App\Models;

use App\Support\SignatureImage;
use Illuminate\Database\Eloquent\Model;

class ParishSetting extends Model
{
    protected $primaryKey = 'key';
    protected $keyType = 'string';
    public $incrementing = false;

    protected $fillable = ['key', 'value'];

    protected function casts(): array
    {
        return ['value' => 'json'];
    }

    public const DEFAULTS = [
        'parish_name' => 'St. Peter the Apostle Parish',
        'priest_name' => 'Rev. Fr. Leopoldo S. Evangelista',
        'priest_title' => 'Parish Priest',
        'parish_address' => 'Balagtas, Bulacan',
        'parish_phone' => '09123456789',
        'working_hours_start' => '08:00',
        'working_hours_end' => '17:00',
        'lunch_start' => '12:00',
        'lunch_end' => '13:00',
        'slot_step_minutes' => 30,
        'travel_buffer_minutes' => 30,
    ];

    public static function get(string $key, mixed $default = null): mixed
    {
        $row = static::find($key);

        return $row?->value ?? $default ?? (self::DEFAULTS[$key] ?? null);
    }

    /** Storing null removes the setting, so it falls back to its default (the value column cannot hold null). */
    public static function put(string $key, mixed $value): void
    {
        if ($value === null) {
            static::whereKey($key)->delete();

            return;
        }
        static::updateOrCreate(['key' => $key], ['value' => $value]);
    }

    public static function priestName(): string
    {
        return (string) static::get('priest_name');
    }

    public static function priestTitle(): string
    {
        return (string) static::get('priest_title');
    }

    /**
     * The priest's signature as a PNG or JPEG data URL, or null when none is set. It is checked when it is saved
     * (SignatureImage); this second, cheap check means nothing else can ever reach a certificate's img tag.
     */
    public static function priestSignature(): ?string
    {
        $value = static::get('priest_signature');

        return is_string($value) && SignatureImage::isClean($value) ? $value : null;
    }

    public static function parishName(): string
    {
        return (string) static::get('parish_name');
    }

    public static function parishAddress(): string
    {
        return (string) static::get('parish_address');
    }

    public static function parishPhone(): string
    {
        return (string) static::get('parish_phone');
    }

    /** @return array{0: string, 1: string} */
    public static function workingHours(): array
    {
        return [(string) static::get('working_hours_start'), (string) static::get('working_hours_end')];
    }

    /** The office closes for lunch: no visit may start or run through it. Equal times mean no lunch break. @return array{0: string, 1: string} */
    public static function lunchBreak(): array
    {
        return [(string) static::get('lunch_start'), (string) static::get('lunch_end')];
    }

    public static function slotStepMinutes(): int
    {
        return (int) static::get('slot_step_minutes');
    }

    public static function travelBufferMinutes(): int
    {
        return (int) static::get('travel_buffer_minutes');
    }
}
