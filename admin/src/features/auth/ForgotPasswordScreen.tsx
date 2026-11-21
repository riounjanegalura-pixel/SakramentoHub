import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ArrowLeft, Check } from 'lucide-react'
import { forgotPassword } from '../../lib/data/auth'
import { useSlowRequestNotice } from '../../lib/hooks/useSlowRequestNotice'
import { AUTH_H1, AUTH_INPUT, AUTH_LINK, AUTH_PRIMARY, AuthLabel, AuthShell, SlowNotice } from './AuthShell'

export function ForgotPasswordScreen() {
  const [email, setEmail] = useState('')
  const mutation = useMutation({ mutationFn: () => forgotPassword(email) })
  const isSlow = useSlowRequestNotice(mutation.isPending)

  if (mutation.isSuccess) {
    return (
      <AuthShell>
        <div role="img" aria-label="Done" className="mb-5 flex size-12 items-center justify-center rounded-full bg-status-done-bg text-status-done-fg">
          <Check size={24} aria-hidden="true" />
        </div>
        <h1 className={`mb-2 ${AUTH_H1}`}>Check your email</h1>
        <p className="mb-7 text-[15px] leading-normal text-ink-muted">
          If <strong className="text-ink">{email}</strong> has an account, a reset link is on its way.
        </p>
        <div className="flex flex-col gap-1.5">
          <Link to="/login" className={AUTH_PRIMARY}>Back to sign in</Link>
          <button type="button" onClick={() => mutation.reset()} className={`${AUTH_LINK} justify-center`}>
            Use a different email
          </button>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell>
      <Link
        to="/login"
        className="-ml-2 mb-3 inline-flex min-h-11 items-center gap-1.5 px-2 text-[14px] font-semibold text-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <ArrowLeft size={18} aria-hidden="true" />
        Back to sign in
      </Link>
      <h1 className={`mb-2 ${AUTH_H1}`}>Forgot your password?</h1>
      <p className="mb-7 text-[15px] leading-normal text-ink-muted">Enter your email and we will send a reset link.</p>
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
        {mutation.isError && <p role="alert" className="text-[14px] text-danger">{(mutation.error as Error).message}</p>}
        {isSlow && <SlowNotice />}
        <button type="submit" disabled={mutation.isPending} className={AUTH_PRIMARY}>
          {mutation.isPending ? 'Sending…' : 'Send reset link'}
        </button>
      </form>
    </AuthShell>
  )
}
