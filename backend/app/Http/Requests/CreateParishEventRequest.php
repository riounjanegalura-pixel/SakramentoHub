<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class CreateParishEventRequest extends FormRequest
{
    public function authorize(): bool
    {
        // Route-level 'role:staff,admin' middleware already gates this —
        // mirrors every other FormRequest in this app.
        return true;
    }

    public function rules(): array
    {
        return [
            'title' => ['required', 'string', 'max:255'],
            'date' => ['required', 'date'],
            'location' => ['nullable', 'string', 'max:255'],
            'imageUrl' => ['nullable', 'string', 'max:2048'],
            'category' => ['required', Rule::in(config('parish_events.categories'))],
        ];
    }
}
