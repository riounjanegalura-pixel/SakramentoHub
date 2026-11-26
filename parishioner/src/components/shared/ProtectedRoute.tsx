import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/auth-store'
import { useSlowRequestNotice } from '../../hooks/useSlowRequestNotice'
import { VerifyEmailGate } from './VerifyEmailGate'

/**
 * Guards routes that require a logged-in user. useAuthBootstrap rehydrates
 * the auth store asynchronously on load (see hooks/useAuthBootstrap.ts), so
 * this waits for that bootstrap to settle before deciding — otherwise a
 * hard-refreshed, actually-logged-in user would get bounced to /login for
 * the one frame before their session comes back from storage.
 *
 * Item 20's remainder: this bootstrap check is the first authenticated
 * network call a session makes on EVERY entry point, not just login — a
 * parishioner opening a bookmarked deep link (or reopening the installed
 * PWA) hits this before anything else, and previously saw a blank white
 * screen with zero feedback for however long a Render free-tier cold start
 * takes (up to ~60s). Login already had this messaging; this closes the
 * other real gap without retrofitting all ~15+ screens individually.
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user)
  const isBootstrapping = useAuthStore((s) => s.isBootstrapping)
  const isSlow = useSlowRequestNotice(isBootstrapping)

  if (isBootstrapping) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-navy px-6 text-center text-white">
        <div className="mb-4 h-10 w-10 animate-spin rounded-full border-2 border-white/30 border-t-white" />
        {isSlow && (
          <p className="text-sm text-white/70">
            Waking up the server — this can take up to a minute on the first try.
          </p>
        )}
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  // A parishioner confirms their email first. Staff and admin accounts are made by the parish and are not held up.
  if (user.role === 'parishioner' && !user.emailVerifiedAt) return <VerifyEmailGate />

  return <>{children}</>
}
