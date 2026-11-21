<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class RegisterRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'fullName' => ['required', 'string', 'min:2'],
            'email' => ['required', 'email', 'unique:users,email'],
            'phone' => ['nullable', 'string'],
            'password' => ['required', 'string', 'min:8'],
            // Registration cannot succeed without it — this is what makes
            // NFR:001's Data Privacy Act claim actually demonstrable rather
            // than just asserted in the paper. 'accepted' passes for
            // true/1/"yes"/"on", matching a checkbox either as a real JSON
            // boolean or a plain form field.
            'privacyConsent' => ['required', 'accepted'],
            // Teens register for themselves (Confirmation candidates are about 12-16); mirrors REGISTER_MIN_AGE in the app.
            'birthDate' => ['required', 'date_format:Y-m-d', 'before_or_equal:'.\App\Support\ParishClock::today()->subYears(13)->toDateString()],
            'sex' => ['required', 'in:male,female'],
        ];
    }

    public function messages(): array
    {
        return [
            'privacyConsent.required' => 'You must agree to the Privacy Notice to create an account.',
            'privacyConsent.accepted' => 'You must agree to the Privacy Notice to create an account.',
        ];
    }
}
