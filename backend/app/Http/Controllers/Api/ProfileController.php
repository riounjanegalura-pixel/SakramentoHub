<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\ChangePasswordRequest;
use App\Http\Requests\UpdateProfileRequest;
use App\Http\Resources\UserResource;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class ProfileController extends Controller
{
    public function update(UpdateProfileRequest $request)
    {
        $user = $request->user();

        $user->update(array_filter([
            'full_name' => $request->fullName,
            'email' => $request->email,
            'phone' => $request->phone,
            'address' => $request->address,
            'birth_date' => $request->birthDate,
            'sex' => $request->sex,
            'civil_status' => $request->civilStatus,
            'home_parish' => $request->homeParish,
        ], fn ($v) => $v !== null));

        // These two are nullable: sending null clears the column, omitting the key leaves it alone.
        if ($request->has('addressLine')) {
            $user->address_line = $request->input('addressLine');
        }
        if ($request->has('addressPsgc')) {
            $psgc = $request->validated('addressPsgc');
            $user->address_psgc = $psgc === null ? null : Arr::only($psgc, ['display', 'regionCode', 'provinceCode', 'cityCode', 'barangayCode']);
        }
        $user->save();

        return new UserResource($user->fresh());
    }

    public function changePassword(ChangePasswordRequest $request)
    {
        $user = $request->user();

        if (! Hash::check($request->currentPassword, $user->password)) {
            throw ValidationException::withMessages([
                'currentPassword' => ['Current password is incorrect'],
            ]);
        }

        $user->update(['password' => Hash::make($request->newPassword)]);

        // Every other signed-in device is signed out; this one keeps working.
        $current = $user->currentAccessToken();
        $others = $user->tokens();
        if ($current instanceof \Laravel\Sanctum\PersonalAccessToken) {
            $others->whereKeyNot($current->getKey());
        }
        $others->delete();

        return response()->noContent();
    }
}
