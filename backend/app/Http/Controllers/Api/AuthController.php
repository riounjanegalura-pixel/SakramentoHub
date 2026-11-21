<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\ForgotPasswordRequest;
use App\Http\Requests\LoginRequest;
use App\Http\Requests\RegisterRequest;
use App\Http\Requests\ResetPasswordRequest;
use App\Http\Resources\UserResource;
use App\Models\User;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function register(RegisterRequest $request)
    {
        $user = User::create([
            'full_name' => $request->fullName,
            'email' => $request->email,
            'phone' => $request->phone ?? '',
            'address' => '',
            'password' => Hash::make($request->password),
            // RegisterRequest already refused this request if consent wasn't
            // given — recording exactly when, not just that, so this is a
            // real timestamped record, not a bare boolean.
            'privacy_consent_at' => now(),
            'birth_date' => $request->birthDate,
            'sex' => $request->sex,
        ]);

        // create() doesn't populate attributes the database applies on its own
        // (here, `role`'s column default of 'parishioner') — the row itself is
        // correct, but the in-memory model just returned from create() shows
        // role as null until re-fetched. Without this, the register response
        // (and whatever the frontend does with it immediately, before its next
        // /me call) reports a null role for a brand-new account.
        $user->refresh();

        // Deliberately NOT auto-verified — email_verified_at stays null until
        // the parishioner actually clicks the link this sends (see
        // User::sendEmailVerificationNotification / VerifyEmailNotification).
        // Only parishioners self-register through this endpoint, so this is
        // never fired for staff/admin accounts.
        $user->sendEmailVerificationNotification();

        $token = $user->createToken('parishioner-pwa')->plainTextToken;

        return response()->json([
            'user' => new UserResource($user),
            'token' => $token,
        ], 201);
    }

    public function login(LoginRequest $request)
    {
        $user = User::where('email', $request->email)->first();

        if (! $user || ! Hash::check($request->password, $user->password)) {
            throw ValidationException::withMessages([
                'email' => ['These credentials do not match our records.'],
            ]);
        }

        // A deactivated account (Admin\UserController::deactivate) keeps its
        // row and history intact but can no longer authenticate — checked
        // after the password check, not before, so a wrong password on a
        // deactivated account still reports the generic credentials message
        // above rather than confirming the account exists.
        if (! $user->is_active) {
            throw ValidationException::withMessages([
                'email' => ['This account has been deactivated. Contact the parish office.'],
            ]);
        }

        $token = $user->createToken('parishioner-pwa')->plainTextToken;

        return response()->json([
            'user' => new UserResource($user),
            'token' => $token,
        ]);
    }

    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()->delete();

        return response()->noContent();
    }

    public function me(Request $request)
    {
        return new UserResource($request->user());
    }

    /**
     * Always returns the same generic success response whether or not the
     * email belongs to an account — branching the response on "user not
     * found" is exactly the user-enumeration leak this guards against.
     * Genuinely unexpected broker failures (e.g. RESET_THROTTLED) still 200
     * for the same reason: revealing "you already requested this" also
     * confirms the account exists.
     */
    public function forgotPassword(ForgotPasswordRequest $request)
    {
        Password::sendResetLink($request->only('email'));

        return response()->json([
            'message' => 'If an account exists for that email, a password reset link has been sent.',
        ]);
    }

    public function resetPassword(ResetPasswordRequest $request)
    {
        $status = Password::reset(
            $request->only('email', 'password', 'token'),
            function (User $user, string $password) {
                // User::casts() already declares 'password' => 'hashed', so
                // assigning the plain value hashes it on save — Hash::make()
                // here would double-hash and lock the account out.
                $user->forceFill(['password' => $password])->save();
                // A reset means the old password may be known to someone; every device signs in again.
                $user->tokens()->delete();

                event(new PasswordReset($user));
            }
        );

        if ($status !== Password::PASSWORD_RESET) {
            throw ValidationException::withMessages([
                'token' => [__($status)],
            ]);
        }

        return response()->json(['message' => __($status)]);
    }
}
