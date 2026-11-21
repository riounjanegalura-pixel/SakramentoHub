<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ChangeUserRoleRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            // The full role list, not just admin_creatable — a role change
            // can also legitimately demote staff/admin back to parishioner,
            // unlike creation (which only ever provisions staff/admin).
            'role' => ['required', Rule::in(config('roles.assignable'))],
        ];
    }
}
