<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureAccountIsActive
{
    /**
     * Handle an incoming request.
     *
     * Defense-in-depth for Admin\UserController::deactivate(): `is_active`
     * was previously only ever checked at login (AuthController::login), so
     * a token issued before deactivation kept authorizing every request for
     * up to 30 days (config/sanctum.php's expiration) even after an admin
     * deactivated the account — deactivate() itself now also revokes the
     * user's tokens directly, but this middleware is the backstop for any
     * future mutation path that forgets to (exactly what happened here).
     * 401s rather than 403s: an inactive account isn't merely forbidden from
     * one resource, its whole session is no longer valid, same as an
     * unauthenticated request.
     *
     * @param  Closure(Request): (Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($user && ! $user->is_active) {
            abort(401, 'This account has been deactivated.');
        }

        return $next($request);
    }
}
