<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class CreateStaffUserRequest extends FormRequest
{
    public function authorize(): bool
    {
        // Route-level 'role:admin' middleware already gates this — mirrors
        // every other FormRequest in this app (RegisterRequest included),
        // which all return true here and let middleware own authorization.
        return true;
    }

    public function rules(): array
    {
        return [
            'fullName' => ['required', 'string', 'min:2'],
            'email' => ['required', 'email', 'unique:users,email'],
            'phone' => ['nullable', 'string'],
            // Same minimum as RegisterRequest's own password rule — an
            // admin-provisioned account gets no weaker a password floor
            // than a self-registered one.
            'password' => ['required', 'string', 'min:8'],
            'role' => ['required', Rule::in(config('roles.admin_creatable'))],
        ];
    }
}
