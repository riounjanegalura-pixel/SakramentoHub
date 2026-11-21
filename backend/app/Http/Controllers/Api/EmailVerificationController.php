<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\VerifyEmailRequest;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class EmailVerificationController extends Controller
{
    /**
     * Same 60-minute window as the password-reset broker (config/auth.php's
     * passwords.users.expire) — kept as one literal here since this table
     * has no broker config of its own; both express the same "reasonable
     * link lifetime" policy.
     */
    private const TOKEN_EXPIRY_MINUTES = 60;

    /**
     * Authenticated resend — lets someone who registered but lost/ignored
     * the original email get a fresh one without re-registering. Rate
     * limited (see routes/api.php) since it dispatches a notification/DB
     * write per call.
     */
    public function resend(Request $request)
    {
        $user = $request->user();

        if ($user->hasVerifiedEmail()) {
            return response()->json(['message' => 'Your email is already verified.']);
        }

        $user->sendEmailVerificationNotification();

        return response()->json(['message' => 'Verification email sent.']);
    }

    /**
     * Authenticated: the 6-digit code from the email, typed in the app. Same 60-minute window as the link, and the
     * same single use. The route has its own tight rate limit, so a 6-digit code cannot be guessed in an hour.
     */
    public function verifyCode(Request $request)
    {
        $request->validate(['code' => ['required', 'digits:6']]);
        $user = $request->user();

        if ($user->hasVerifiedEmail()) {
            return response()->json(['message' => 'Your email is already verified.']);
        }

        $record = DB::table('email_verification_tokens')->where('email', $user->email)->first();
        $expired = $record && abs(now()->diffInMinutes($record->created_at)) > self::TOKEN_EXPIRY_MINUTES;

        if (! $record || $expired || ! $record->code || ! Hash::check($request->code, $record->code)) {
            throw ValidationException::withMessages([
                'code' => ['That code is wrong or has expired. Check the latest email, or send a new one.'],
            ]);
        }

        $user->markEmailAsVerified();
        DB::table('email_verification_tokens')->where('email', $user->email)->delete();

        return response()->json(['message' => 'Email verified.']);
    }

    /**
     * Public (token+email act as the credential — same shape as
     * reset-password), rate-limited. Consumes the token on success so it
     * can't be replayed.
     */
    public function verify(VerifyEmailRequest $request)
    {
        $record = DB::table('email_verification_tokens')->where('email', $request->email)->first();

        // Carbon's diffInMinutes() defaults to a *signed* difference since
        // Carbon 3 (not absolute, despite the older docs/habit) — abs() here
        // is load-bearing, not decorative: without it an expired (in the
        // past) created_at produces a negative number that never exceeds
        // the expiry threshold, silently accepting expired tokens forever.
        $expired = $record && abs(now()->diffInMinutes($record->created_at)) > self::TOKEN_EXPIRY_MINUTES;

        if (! $record || $expired || ! Hash::check($request->token, $record->token)) {
            throw ValidationException::withMessages([
                'token' => ['This verification link is invalid or has expired.'],
            ]);
        }

        $user = User::where('email', $request->email)->first();

        if (! $user) {
            throw ValidationException::withMessages([
                'token' => ['This verification link is invalid or has expired.'],
            ]);
        }

        if (! $user->hasVerifiedEmail()) {
            $user->markEmailAsVerified();
        }

        DB::table('email_verification_tokens')->where('email', $request->email)->delete();

        return response()->json(['message' => 'Email verified.']);
    }
}
