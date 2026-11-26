import { useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { MailCheck } from 'lucide-react'
import { resendVerificationEmail, verifyEmailCode } from '../../lib/data/auth'
import { fetchCurrentUser } from '../../lib/data/users'
import { useAuthStore } from '../../stores/auth-store'
import { Button } from '../ui/button'
import { Input } from '../ui/input'

/**
 * Shown in place of the app until a new parishioner has confirmed their email (panel: verify during registration,
 * not through a banner afterwards). It checks again every few seconds, so it clears by itself once the link in the
 * email has been opened, in this browser or on the phone.
 */
export function VerifyEmailGate() {
  const user = useAuthStore((s) => s.user)
  const setUser = useAuthStore((s) => s.setUser)
  const logout = useAuthStore((s) => s.logout)
  const resend = useMutation({ mutationFn: resendVerificationEmail })
  const [code, setCode] = useState('')
  // The 6-digit code from the email: the way in when the emailed link will not open.
  const confirm = useMutation({
    mutationFn: () => verifyEmailCode(code),
    onSuccess: async () => {
      const fresh = await fetchCurrentUser([])
      if (fresh) setUser(fresh)
    },
  })

  useEffect(() => {
    const timer = window.setInterval(() => { // timer: poll for the confirmed email
      void fetchCurrentUser([]).then((fresh) => {
        if (fresh?.emailVerifiedAt) setUser(fresh)
      })
    }, 5000)
    return () => window.clearInterval(timer)
  }, [setUser])

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-paper px-6 text-center text-ink">
      <MailCheck size={40} aria-hidden="true" className="mb-4 text-navy" />
      <h1 className="font-display text-title font-semibold text-navy">Check your email</h1>
      <p className="mt-2 max-w-sm text-body">
        We sent a link to <span className="font-semibold">{user?.email}</span>. Open it to confirm your account, then come back here. This page continues by itself.
      </p>
      <form
        className="mt-5 flex w-full max-w-xs flex-col gap-2 text-left"
        onSubmit={(e) => {
          e.preventDefault()
          if (/^\d{6}$/.test(code)) confirm.mutate()
        }}
      >
        <label htmlFor="verify-code" className="text-sm font-semibold text-ink">Type the 6-digit code from the email</label>
        <Input id="verify-code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="123456" className="text-center text-lg tracking-widest" />
        <Button type="submit" disabled={confirm.isPending || code.length !== 6}>{confirm.isPending ? 'Checking…' : 'Confirm'}</Button>
        {confirm.isError && <p role="alert" className="text-sm font-medium text-danger">{(confirm.error as Error).message}</p>}
      </form>
      <p className="mt-4 max-w-sm text-sm text-ink-muted">Not there? Look in your spam folder.</p>
      {resend.isSuccess ? (
        <p role="status" className="mt-4 text-navy">Sent again. It can take a minute to arrive.</p>
      ) : (
        <Button type="button" className="mt-4" onClick={() => resend.mutate()} disabled={resend.isPending}>
          {resend.isPending ? 'Sending…' : 'Send the email again'}
        </Button>
      )}
      {resend.isError && <p role="alert" className="mt-2 text-danger">{(resend.error as Error).message}</p>}
      <button type="button" onClick={() => void logout()} className="mt-6 min-h-11 text-sm font-semibold text-navy underline">
        Use a different account
      </button>
    </main>
  )
}
