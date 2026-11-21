import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { CircleAlert, Eye, EyeOff } from 'lucide-react'
import { resetPassword } from '../../lib/data/auth'
import { ApiError } from '../../lib/api/client'
import { useSlowRequestNotice } from '../../lib/hooks/useSlowRequestNotice'
import { AUTH_H1, AUTH_INPUT, AUTH_LINK, AUTH_PRIMARY, AuthLabel, AuthShell, SlowNotice } from './AuthShell'

/** The link was missing its token, or the server refused it as used or expired. */
function InvalidLink({ message }: { message: string }) {
  return (
    <AuthShell>
      <div role="img" aria-label="Problem" className="mb-5 flex size-12 items-center justify-center rounded-full bg-status-rejected-bg text-status-rejected-fg">
        <CircleAlert size={24} aria-hidden="true" />
      </div>
      <h1 className={`mb-2 ${AUTH_H1}`}>This link can&apos;t be used</h1>
      <p className="mb-7 text-[15px] leading-normal text-ink-muted">{message}</p>
      <div className="flex flex-col gap-1.5">
        <Link to="/forgot-password" className={AUTH_PRIMARY}>Request a new link</Link>
        <Link to="/login" className={`${AUTH_LINK} justify-center`}>Back to sign in</Link>
      </div>
    </AuthShell>
  )
}

export function ResetPasswordScreen() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const email = searchParams.get('email') ?? ''
  const [password, setPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [confirmError, setConfirmError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () => resetPassword(token, email, password, passwordConfirmation),
    onSuccess: () => navigate('/login'),
  })
  const isSlow = useSlowRequestNotice(mutation.isPending)

  if (!token || !email) return <InvalidLink message="This link is missing its details. Request a new one." />
  // A link the server refuses as expired or used (not a password rule) gets the same screen.
  if (mutation.error instanceof ApiError && /token|expired|link/i.test(mutation.error.message)) {
    return <InvalidLink message="This link has expired. Request a new one." />
  }
  const serverError = mutation.isError ? (mutation.error as Error).message : null
  const inputType = showPassword ? 'text' : 'password'

  return (
    <AuthShell>
      <h1 className={`mb-6 ${AUTH_H1}`}>Set a new password</h1>
      <form
        className="flex flex-col gap-[18px]"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          const short = password.length < 8 ? 'Use at least 8 characters.' : null
          const mismatch = password !== passwordConfirmation ? 'Passwords do not match. Type the same password in both fields.' : null
          setPasswordError(short)
          setConfirmError(short ? null : mismatch)
          if (short || mismatch) return
          mutation.mutate()
        }}
      >
        <div className="flex flex-col gap-1.5">
          <AuthLabel htmlFor="password">New password</AuthLabel>
          <div id="password-hint" className="text-[14px] text-ink-muted">At least 8 characters.</div>
          <div className="relative">
            <input
              id="password"
              type={inputType}
              autoComplete="new-password"
              aria-describedby="password-hint password-error"
              aria-invalid={passwordError ? true : undefined}
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
          {passwordError && <p id="password-error" role="alert" className="text-[14px] text-danger">{passwordError}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <AuthLabel htmlFor="confirm">Confirm password</AuthLabel>
          <input
            id="confirm"
            type={inputType}
            autoComplete="new-password"
            aria-invalid={confirmError ? true : undefined}
            aria-describedby="confirm-error"
            value={passwordConfirmation}
            onChange={(e) => setPasswordConfirmation(e.target.value)}
            className={AUTH_INPUT}
          />
          {confirmError && <p id="confirm-error" role="alert" className="text-[14px] text-danger">{confirmError}</p>}
        </div>
        {serverError && <p role="alert" className="text-[14px] text-danger">{serverError}</p>}
        {isSlow && <SlowNotice />}
        <button type="submit" disabled={mutation.isPending} className={AUTH_PRIMARY}>
          {mutation.isPending ? 'Saving…' : 'Save new password'}
        </button>
      </form>
    </AuthShell>
  )
}
