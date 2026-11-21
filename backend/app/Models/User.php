<?php

namespace App\Models;

use App\Notifications\ResetPasswordNotification;
use App\Notifications\VerifyEmailNotification;
use Illuminate\Auth\MustVerifyEmail as MustVerifyEmailTrait;
use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable implements MustVerifyEmail
{
    use HasApiTokens, HasFactory, HasUuids, MustVerifyEmailTrait, Notifiable;

    protected $fillable = [
        'full_name',
        'email',
        'phone',
        'address',
        'password',
        'role',
        'is_active',
        'privacy_consent_at',
        'birth_date',
        'sex',
        'civil_status',
        'address_line',
        'address_psgc',
        'home_parish',
    ];

    protected $hidden = [
        'password',
        'remember_token',
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'privacy_consent_at' => 'datetime',
            'password' => 'hashed',
            'is_active' => 'boolean',
            'address_psgc' => 'array',
        ];
    }

    /**
     * Overrides the framework default, which sends
     * Illuminate\Auth\Notifications\ResetPassword — that class links to the
     * 'password.reset' named route, which doesn't exist on this API-only
     * backend. See ResetPasswordNotification for the real frontend link.
     */
    public function sendPasswordResetNotification($token): void
    {
        $this->notify(new ResetPasswordNotification($token));
    }

    /**
     * Overrides the framework default (Illuminate\Auth\Notifications\VerifyEmail,
     * which needs a signed 'verification.verify' named route this backend
     * doesn't have). Mirrors the password-reset broker's own storage pattern
     * — a random token, hashed at rest, keyed by email, with a created_at
     * used for expiry — in the dedicated email_verification_tokens table
     * (see EmailVerificationController::verify for the matching check).
     */
    public function sendEmailVerificationNotification(): void
    {
        $token = Str::random(64);
        // Typed on the app's "Check your email" screen when the emailed link cannot be opened.
        $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);

        DB::table('email_verification_tokens')->updateOrInsert(
            ['email' => $this->email],
            ['token' => Hash::make($token), 'code' => Hash::make($code), 'created_at' => now()]
        );

        $this->notify(new VerifyEmailNotification($token, $code));
    }
}
