import { useEffect } from 'react'
import { fetchCurrentUser } from '../lib/data/auth'
import { ApiError, getAuthToken, clearAuthToken } from '../lib/api/client'
import { useAuthStore } from '../stores/auth-store'

/**
 * Rehydrates the in-memory auth store from a token already persisted in
 * localStorage (see lib/api/client.ts). Without this, a hard refresh would
 * always show the login screen even though a valid Sanctum token is on
 * disk. Call once, near the app root.
 *
 * While the check is in flight, auth-store's `isBootstrapping` stays true so
 * ProtectedRoute can hold off on redirecting to /login until the session
 * either rehydrates or is confirmed invalid/absent.
 */
export function useAuthBootstrap(): void {
  const setUser = useAuthStore((s) => s.setUser)
  const finishBootstrap = useAuthStore((s) => s.finishBootstrap)

  useEffect(() => {
    let cancelled = false

    if (!getAuthToken()) {
      finishBootstrap()
      return
    }

    fetchCurrentUser()
      .then((user) => {
        if (!cancelled) setUser(user)
      })
      .catch((error: unknown) => {
        // Only the server saying the token is no longer valid signs the person out.
        // A sleeping host, a dropped connection or a reload mid-request must not
        // throw the token away: the next load would otherwise ask for a login again.
        if (error instanceof ApiError && error.status === 401) clearAuthToken()
      })
      .finally(() => {
        if (!cancelled) finishBootstrap()
      })

    return () => {
      cancelled = true
    }
  }, [setUser, finishBootstrap])
}
