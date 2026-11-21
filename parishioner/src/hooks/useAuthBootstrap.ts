import { useEffect } from 'react'
import { fetchCurrentUser } from '../lib/data/users'
import { useAuthStore } from '../stores/auth-store'

/**
 * Rehydrates the in-memory auth store from the session already persisted in
 * localStorage (lib/mock/users.ts's fetchCurrentUser). Without this, the
 * Zustand auth store starts empty on every page load/PWA relaunch even
 * though login() already wrote a session record — the user appears logged
 * out ("Welcome back, there" / a blank Profile screen) despite having a
 * valid session on disk. Call once, near the app root.
 *
 * While the fetch is in flight, auth-store's `isBootstrapping` stays true so
 * ProtectedRoute can hold off on redirecting to /login until the session
 * either rehydrates or is confirmed absent.
 */
export function useAuthBootstrap(): void {
  const setUser = useAuthStore((s) => s.setUser)
  const finishBootstrap = useAuthStore((s) => s.finishBootstrap)

  useEffect(() => {
    let cancelled = false

    fetchCurrentUser()
      .then((user) => {
        if (!cancelled && user) setUser(user)
      })
      .catch(() => {
        // No session, or the mock's simulated failure fired — the store
        // simply stays logged-out, same as a fresh visit.
      })
      .finally(() => {
        if (!cancelled) finishBootstrap()
      })

    return () => {
      cancelled = true
    }
  }, [setUser, finishBootstrap])
}
