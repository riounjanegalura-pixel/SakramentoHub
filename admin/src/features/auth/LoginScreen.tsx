import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { CircleAlert, Eye, EyeOff, Loader2 } from 'lucide-react'
import { login } from '../../lib/data/auth'
import { useAuthStore } from '../../stores/auth-store'
import { ApiError, clearAuthToken } from '../../lib/api/client'
import { safeReturnTarget } from '../../lib/returnTo'
import { AUTH_H1, AUTH_INPUT, AUTH_LINK, AUTH_PRIMARY, AuthLabel, AuthShell } from './AuthShell'

const ALLOWED_ROLES = ['staff', 'admin'] // 'staff' is a legacy value; nothing creates it any more
const WRONG_LOGIN = 'That email or password is not right. Check both and try again.'

export function LoginScreen() {
  const navigate = useNavigate()
  const location = useLocation()
  const locationState = location.state as { error?: string; from?: unknown } | null
  const locationError = locationState?.error
  const setUser = useAuthStore((s) => s.setUser)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [roleError, setRoleError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () => login(email, password),
    onSuccess: (user) => {
      if (!ALLOWED_ROLES.includes(user.role)) {
        // Authenticated, but not staff/admin: reject rather than admit.
        clearAuthToken()
        setRoleError('This account does not have admin access.')
        return
      }
      setRoleError(null)
      setUser(user)
      navigate(safeReturnTarget(locationState?.from), { replace: true })
    },
  })

  // A wrong email or password reads the same in every case; any other failure keeps the server's own words.
  const failure = mutation.isError
    ? mutation.error instanceof ApiError && [401, 422].includes(mutation.error.status)
      ? WRONG_LOGIN
      : (mutation.error as Error).message
    : null
  const bannerError = roleError ?? failure
  const bannerInfo = !bannerError ? locationError : null

  return (
    <AuthShell>
      <h1 className={`mb-6 ${AUTH_H1}`}>Sign in</h1>

      {(bannerError || bannerInfo) && (
        <div
          role="alert"
          className={`mb-5 flex items-start gap-2.5 rounded-xl px-3.5 py-3 text-[14px] leading-[1.45] ${bannerError ? 'bg-status-rejected-bg text-status-rejected-fg' : 'bg-status-pending-bg text-status-pending-fg'}`}
        >
          <CircleAlert size={18} aria-hidden="true" className="mt-px shrink-0" />
          <span>{bannerError ?? bannerInfo}</span>
        </div>
      )}

      <form
        className="flex flex-col gap-[18px]"
        onSubmit={(e) => {
          e.preventDefault()
          mutation.mutate()
        }}
      >
        <div className="flex flex-col gap-1.5">
          <AuthLabel htmlFor="email">Email address</AuthLabel>
          <input
            id="email"
            type="email"
            required
            autoComplete="username"
            placeholder="name@parish.org"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={AUTH_INPUT}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <AuthLabel htmlFor="password">Password</AuthLabel>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              required
              autoComplete="current-password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`${AUTH_INPUT} pr-[52px]`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute right-0.5 top-0.5 flex size-11 items-center justify-center rounded-[10px] text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              {showPassword ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
            </button>
          </div>
        </div>
        <div className="-mt-2 flex justify-end">
          <Link to="/forgot-password" className={AUTH_LINK}>Forgot password?</Link>
        </div>

        <button type="submit" disabled={mutation.isPending} className={AUTH_PRIMARY}>
          {mutation.isPending ? (
            <>
              <Loader2 size={20} className="animate-spin" aria-hidden="true" />
              <span className="sr-only" role="status">Signing in</span>
            </>
          ) : (
            'Sign in'
          )}
        </button>
      </form>

      <p className="mt-7 text-[14px] leading-normal text-ink-muted">Need access? Ask a parish admin to add you.</p>
    </AuthShell>
  )
}
