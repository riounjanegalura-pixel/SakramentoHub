import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../stores/auth-store'
import { useSlowRequestNotice } from '../../lib/hooks/useSlowRequestNotice'

const ALLOWED_ROLES = ['staff', 'admin'] // 'staff' is a legacy value; nothing creates it any more

/**
 * Guards every admin route: requires a logged-in user AND a role of `staff`
 * or `admin` — a `parishioner` who somehow authenticates (e.g. a stale
 * token) is bounced to /login with an error rather than admitted, per the
 * task's "reject, do not admit" requirement. useAuthBootstrap rehydrates the
 * store asynchronously (see hooks/useAuthBootstrap.ts), so this waits for
 * that to settle before deciding.
 *
 * Item 20's remainder: this bootstrap check is an admin's first authenticated
 * request of the day (a hard refresh, or the first action after opening the
 * admin app) — previously a blank screen with no feedback for however long a
 * Render free-tier cold start takes. Login already had this messaging; this
 * closes the other real gap without retrofitting every screen.
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user)
  const isBootstrapping = useAuthStore((s) => s.isBootstrapping)
  const isSlow = useSlowRequestNotice(isBootstrapping)
  const location = useLocation()

  if (isBootstrapping) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-surface px-6 text-center">
        <div className="mb-4 h-10 w-10 animate-spin rounded-full border-2 border-line border-t-navy" />
        {isSlow && (
          <p className="text-sm text-ink-muted">
            Waking up the server — this can take up to a minute on the first try.
          </p>
        )}
      </div>
    )
  }
  // Remember the page that was asked for so signing in lands back on it (LoginScreen vets the value).
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  if (!ALLOWED_ROLES.includes(user.role)) {
    return <Navigate to="/login" replace state={{ error: 'This account does not have admin access.' }} />
  }

  return <>{children}</>
}
