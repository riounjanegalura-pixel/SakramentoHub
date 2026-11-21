<?php

namespace App\Http\Requests;

use App\Support\ParishClock;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** Draft create/update: shape only. Full content rules run at submit (SacramentRules). */
class CreateBookingRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public static function draftRules(): array
    {
        return [
            'formData' => ['sometimes', 'array'],
            'appointmentDate' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:'.ParishClock::todayString()],
            'appointmentStart' => ['nullable', 'date_format:H:i'],
        ];
    }

    public function rules(): array
    {
        return [
            'sacrament' => ['required', Rule::exists('services', 'id')],
            'formData' => ['present', 'array'],
        ] + self::draftRules();
    }
}
