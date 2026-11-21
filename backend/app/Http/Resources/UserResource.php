<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class UserResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'fullName' => $this->full_name,
            'email' => $this->email,
            'phone' => $this->phone,
            'address' => $this->address,
            'birthDate' => $this->birth_date ? substr((string) $this->birth_date, 0, 10) : null,
            'sex' => $this->sex,
            'civilStatus' => $this->civil_status,
            'addressLine' => $this->address_line,
            'addressPsgc' => $this->address_psgc,
            'homeParish' => $this->home_parish,
            'role' => $this->role,
            'isActive' => (bool) $this->is_active,
            'emailVerifiedAt' => $this->email_verified_at?->toISOString(),
        ];
    }
}
