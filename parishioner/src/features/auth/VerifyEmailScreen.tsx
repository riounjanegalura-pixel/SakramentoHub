import { useEffect, useRef } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { verifyEmail } from '../../lib/data/auth'
import { useAuthStore } from '../../stores/auth-store'
import { maskEmail } from '../../lib/mask-email'
import { Button } from '../../components/ui/button'
import { AuthPage } from './authForm'

export function VerifyEmailScreen() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const email = searchParams.get('email') ?? ''
  const updateUser = useAuthStore((s) => s.updateUser)
  const user = useAuthStore((s) => s.user)

  const mutation = useMutation({
    mutationFn: () => verifyEmail(token, email),
    onSuccess: () => {
      // If the verifying account is the currently logged-in session, reflect
      // it immediately so the unverified banner disappears without a
      // refresh — otherwise this just confirms the account is verified and
      // the next login/`/me` call will pick it up.
      if (user && user.email === email) {
        updateUser({ emailVerifiedAt: new Date().toISOString() })
      }
    },
  })

  // Guards against firing the verify request twice per page load — an empty
  // dependency array alone doesn't stop this under React 18 StrictMode's
  // intentional mount/unmount/remount in development, which would otherwise
  // send two real requests to the backend for one visit.
  const firedRef = useRef(false)
  useEffect(() => {
    if (firedRef.current) return
    if (token && email) {
      firedRef.current = true
      mutation.mutate()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, email])

  return (
    <AuthPage title="Email verification">
      <div className="grid gap-6">
        {/* One live region for the whole outcome, so the result is announced when it replaces "Verifying…". */}
        <div role="status" className="grid gap-2">
          {!token || !email ? (
            <>
              <h2 className="font-display text-xl font-semibold text-ink">Invalid Link</h2>
              <p className="text-ink-muted">This verification link is missing its token or email.</p>
            </>
          ) : mutation.isPending || mutation.isIdle ? (
            <>
              <h2 className="font-display text-xl font-semibold text-ink">Verifying…</h2>
              <p className="text-ink-muted">Please wait a moment.</p>
              <p className="text-sm text-ink-muted">for {maskEmail(email)}</p>
            </>
          ) : mutation.isSuccess ? (
            <>
              <h2 className="font-display text-xl font-semibold text-ink">Email Verified</h2>
              <p className="text-ink-muted">Your email address has been verified. You can now submit bookings.</p>
              <p className="text-sm text-ink-muted">{maskEmail(email)}</p>
            </>
          ) : (
            <>
              <h2 className="font-display text-xl font-semibold text-ink">Verification Failed</h2>
              <p className="text-ink-muted">
                {(mutation.error as Error)?.message ?? 'This link is invalid or has expired.'}
              </p>
              <p className="text-sm text-ink-muted">{maskEmail(email)}</p>
            </>
          )}
        </div>

        <Button asChild className="w-full">
          <Link to={user ? '/home' : '/login'}>{user ? 'Go to Home' : 'Back to sign in'}</Link>
        </Button>
      </div>
    </AuthPage>
  )
}
