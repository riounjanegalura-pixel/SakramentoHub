<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\ChangeUserRoleRequest;
use App\Http\Requests\CreateStaffUserRequest;
use App\Http\Resources\UserResource;
use App\Models\AuditLog;
use App\Models\User;
use App\Support\TextSearch;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;

/**
 * Item 21 — before this, the only way to create a staff account or change a
 * role was editing the database directly. Scoped to `role:admin` only (see
 * routes/api.php), not `role:staff,admin` like the booking admin routes:
 * letting `staff` create other staff/admin accounts, or change roles
 * (including its own), is a real privilege-escalation question this app
 * doesn't need to take on — admin-only is the defensible, documented
 * default until a real need for a wider grant surfaces.
 */
class UserController extends Controller
{
    public function index(Request $request)
    {
        $request->validate([
            'role' => ['sometimes', Rule::in(config('roles.all'))],
            'search' => ['sometimes', 'string', 'max:255'],
        ]);

        $query = User::query();

        if ($request->filled('role')) {
            $query->where('role', $request->string('role')->toString());
        }

        if ($request->filled('search')) {
            $this->applySearch($query, $request->string('search')->toString());
        }

        $users = $query->orderByDesc('created_at')->paginate(15)->withQueryString();

        return UserResource::collection($users);
    }

    /** Mirrors Admin\BookingController::applySearch via TextSearch: case-insensitive,
     * partial-match, wildcard-escaped, Ñ/accent-safe against name/email. */
    private function applySearch($query, string $term): void
    {
        $term = trim($term);
        if ($term === '') return;

        $query->where(function ($q) use ($term) {
            TextSearch::orContains($q, 'full_name', $term);
            TextSearch::orContains($q, 'email', $term);
        });
    }

    public function store(CreateStaffUserRequest $request)
    {
        $user = User::create([
            'full_name' => $request->fullName,
            'email' => $request->email,
            'phone' => $request->phone ?? '',
            'address' => '',
            'password' => Hash::make($request->password),
            'role' => $request->role,
        ]);

        // email_verified_at is deliberately not in User::$fillable (nothing
        // should mass-assign it from arbitrary request input elsewhere), so
        // it's set explicitly here instead. An admin-provisioned account is
        // inherently trusted — mirrors the judgment call already made
        // elsewhere that staff/admin accounts are pre-verified, so this
        // doesn't fire (or need) the email-verification flow
        // self-registration goes through.
        $user->forceFill(['email_verified_at' => now()])->save();

        $this->logAction($request, 'user.created', $user, ['role' => $user->role]);

        return (new UserResource($user->fresh()))->response()->setStatusCode(201);
    }

    public function changeRole(ChangeUserRoleRequest $request, string $id)
    {
        $user = User::findOrFail($id);
        $newRole = $request->role;

        if ($user->role === 'admin' && $newRole !== 'admin' && $this->isLastAdmin($user)) {
            return response()->json([
                'message' => 'Cannot change this role: this is the only remaining admin account.',
            ], 422);
        }

        $fromRole = $user->role;
        $user->update(['role' => $newRole]);

        $this->logAction($request, 'user.role_changed', $user, ['from' => $fromRole, 'to' => $newRole]);

        return new UserResource($user->fresh());
    }

    public function deactivate(Request $request, string $id)
    {
        $user = User::findOrFail($id);

        if ($user->role === 'admin' && $user->is_active && $this->isLastAdmin($user)) {
            return response()->json([
                'message' => 'Cannot deactivate this account: this is the only remaining admin account.',
            ], 422);
        }

        $user->update(['is_active' => false]);

        // Revoke every existing session immediately — without this, a token
        // issued before deactivation kept working for up to 30 days
        // (config/sanctum.php's expiration), since `is_active` was only ever
        // checked at login (AuthController::login), never on the requests an
        // already-issued token makes afterward. Same precaution
        // AccountController::destroy() already takes on self-deletion; a
        // second, defense-in-depth check also lives in
        // EnsureUserIsActive middleware now, in case a future mutation path
        // forgets this line the way this one originally did.
        $user->tokens()->delete();

        $this->logAction($request, 'user.deactivated', $user, []);

        return new UserResource($user->fresh());
    }

    public function activate(Request $request, string $id)
    {
        $user = User::findOrFail($id);
        $user->update(['is_active' => true]);

        $this->logAction($request, 'user.activated', $user, []);

        return new UserResource($user->fresh());
    }

    /** Whether $user is the only active admin left — the real guard behind
     * both the role-change and deactivate 422s above, not just a comment
     * saying one should exist. Counts active admins only: a deactivated
     * admin doesn't block freeing up the "admin" role from the one
     * remaining active account, since a deactivated admin can't act anyway. */
    private function isLastAdmin(User $user): bool
    {
        return User::where('role', 'admin')->where('is_active', true)->count() <= 1;
    }

    private function logAction(Request $request, string $action, User $subject, array $metadata): void
    {
        $actor = $request->user();

        AuditLog::create([
            'actor_user_id' => $actor->id,
            'action' => $action,
            'subject_type' => 'user',
            'subject_id' => $subject->id,
            'metadata' => array_merge($metadata, [
                'actorName' => $actor->full_name,
                'actorEmail' => $actor->email,
                'targetEmail' => $subject->email,
            ]),
            'created_at' => now(),
        ]);
    }
}
