<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateProfileRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'fullName' => ['sometimes', 'string', 'min:2'],
            'email' => ['sometimes', 'email', Rule::unique('users', 'email')->ignore($this->user()->id)],
            'phone' => ['sometimes', 'string', 'regex:/^09\d{9}$/'],
            'address' => ['sometimes', 'string'],
            'birthDate' => ['sometimes', 'date_format:Y-m-d', 'before_or_equal:'.\App\Support\ParishClock::todayString()],
            'sex' => ['sometimes', 'in:male,female'],
            'civilStatus' => ['sometimes', 'in:single,married,widowed,annulled,separated'],
            'addressLine' => ['sometimes', 'nullable', 'string', 'max:255'],
            'addressPsgc' => ['sometimes', 'nullable', 'array'],
            'addressPsgc.display' => ['required_with:addressPsgc', 'string', 'max:255'],
            'addressPsgc.regionCode' => ['nullable', 'string', 'max:20'],
            'addressPsgc.provinceCode' => ['nullable', 'string', 'max:20'],
            'addressPsgc.cityCode' => ['nullable', 'string', 'max:20'],
            'addressPsgc.barangayCode' => ['nullable', 'string', 'max:20'],
            'homeParish' => ['sometimes', 'string', 'max:255'],
        ];
    }
}
