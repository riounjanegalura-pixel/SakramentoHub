import { useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { MessageSquareText } from 'lucide-react'
import { Button } from '../../../components/ui/button'
import { Field } from '../../../components/ui/field'
import { Input } from '../../../components/ui/input'
import { confirmSimulatedPayment, sendSimulatedCode } from '../../../lib/data/bookings'

const MOBILE = /^09\d{9}$/

/**
 * DEMO ONLY (DEMO_PAYMENT_OTP): shown after PayMongo has confirmed a payment. The payer types their mobile number, we text
 * a real six-digit code, and a correct code finishes the step. The code is a demo extra: it does not decide whether the
 * booking is paid (PayMongo's webhook already did), and the heading says what it is.
 */
export function VerifyNumberCard({ bookingId, onVerified }: { bookingId: string; onVerified: () => void }) {
  const [mobile, setMobile] = useState('')
  const [code, setCode] = useState('')
  const [fieldError, setFieldError] = useState<string | null>(null)

  const send = useMutation({ mutationFn: () => sendSimulatedCode(bookingId, mobile) })
  const verify = useMutation({ mutationFn: () => confirmSimulatedPayment(bookingId, code), onSuccess: onVerified })
  const sent = send.data

  function onSend(e: FormEvent) {
    e.preventDefault()
    if (!MOBILE.test(mobile)) {
      setFieldError('Enter an 11-digit mobile number that starts with 09.')
      return
    }
    setFieldError(null)
    setCode('')
    verify.reset()
    send.mutate()
  }

  function onVerify(e: FormEvent) {
    e.preventDefault()
    if (!/^\d{6}$/.test(code)) {
      setFieldError('Enter the 6-digit code.')
      return
    }
    setFieldError(null)
    verify.mutate()
  }

  return (
    <section aria-labelledby="verify-heading" className="flex w-full flex-col gap-4 text-left">
      <div className="text-center">
        <h1 id="verify-heading" className="font-display text-display-xl font-semibold text-navy">Verify your number</h1>
        <p className="mt-2 text-body text-ink-muted">
          Your payment went through. One last demo step: we text you a code to confirm your mobile number.
        </p>
      </div>

      {!sent && (
        <form onSubmit={onSend} className="flex flex-col gap-4" noValidate>
          <Field id="verify-mobile" label="Mobile number" required description="We will text a 6-digit code to this number." error={fieldError ?? undefined}>
            <Input
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              placeholder="09171234567"
              maxLength={11}
              value={mobile}
              onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))}
            />
          </Field>
          {send.isError && <p role="alert" className="text-body text-danger">{(send.error as Error).message}</p>}
          <Button type="submit" size="lg" disabled={send.isPending}>
            {send.isPending ? 'Sending the code…' : 'Send code'}
          </Button>
        </form>
      )}

      {sent && (
        <form onSubmit={onVerify} className="flex flex-col gap-4" noValidate>
          <p role="status" className="flex items-start gap-3 text-body text-ink">
            <MessageSquareText size={22} className="mt-0.5 shrink-0 text-navy" aria-hidden="true" />
            <span>
              We {sent.channel === 'sms' ? 'texted' : 'emailed'} a code to <span className="font-semibold">{sent.to}</span>. It expires in{' '}
              {Math.round(sent.expiresInSeconds / 60)} minutes.
            </span>
          </p>
          <Field id="verify-code" label="6-digit code" required error={fieldError ?? (verify.isError ? (verify.error as Error).message : undefined)}>
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            />
          </Field>
          <Button type="submit" size="lg" disabled={verify.isPending || verify.isSuccess}>
            {verify.isPending || verify.isSuccess ? 'Verifying…' : 'Verify'}
          </Button>
          <Button type="button" variant="outline" disabled={verify.isPending} onClick={() => { send.reset(); setFieldError(null) }}>
            Use a different number or get a new code
          </Button>
        </form>
      )}
    </section>
  )
}
