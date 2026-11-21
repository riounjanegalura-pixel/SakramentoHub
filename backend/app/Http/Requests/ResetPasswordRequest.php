<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class ResetPasswordRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'token' => ['required', 'string'],
            'email' => ['required', 'email'],
            'password' => ['required', 'string', 'min:8'],
            // Laravel's 'confirmed' rule expects a snake_case
            // 'password_confirmation' sibling field — this app's JSON
            // contract is camelCase everywhere (fullName, privacyConsent,
            // currentPassword/newPassword), so 'same:password' against an
            // explicit camelCase field matches that convention instead.
            'passwordConfirmation' => ['required', 'string', 'same:password'],
        ];
    }

    public function messages(): array
    {
        return [
            'passwordConfirmation.same' => 'Passwords do not match.',
        ];
    }
}
