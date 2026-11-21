<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class DeleteAccountRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            // Mirrors ChangePasswordRequest's re-confirmation pattern — a
            // destructive, irreversible action re-checks the current
            // password rather than trusting the session alone.
            'currentPassword' => ['required', 'string'],
        ];
    }
}
