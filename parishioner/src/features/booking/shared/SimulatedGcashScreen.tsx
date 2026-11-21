import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FlaskConical, MessageSquareText } from 'lucide-react'
import { AppShell } from '../../../components/shared/AppShell'
import { AppHeader } from '../../../components/shared/AppHeader'
import { Button } from '../../../components/ui/button'
import { Field } from '../../../components/ui/field'
import { Input } from '../../../components/ui/input'
import { confirmSimulatedPayment, fetchBooking, sendSimulatedCode } from '../../../lib/data/bookings'
import { SACRAMENT_LABEL, peso } from '../../../lib/domain'

const MOBILE = /^09\d{9}$/

/**
 * DEMO ONLY: the stand-in for GCash while the parish has no PayMongo business account. PaymentController::initiate
 * sends the browser here when the backend runs with PAYMENT_MODE=simulated. The one-time code is real (texted to the
 * mobile number, or emailed when no SMS gateway is set up) and checked on the server; a correct code records the
 * payment, but no money moves, and the banner says so on every step.
 */
export function SimulatedGcashScreen() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [params] = useSearchParams()
  const bookingId = params.get('bookingId')

  const [mobile, setMobile] = useState('')
  const [code, setCode] = useState('')
  const [fieldError, setFieldError] = useState<string | null>(null)

  const { data: booking } = useQuery({
    queryKey: ['booking', bookingId],
    queryFn: () => fetchBooking(bookingId!),
    enabled: !!bookingId,
  })

  const send = useMutation({ mutationFn: () => sendSimulatedCode(bookingId!, mobile) })
  const confirm = useMutation({
    mutationFn: () => confirmSimulatedPayment(bookingId!, code),
    onSuccess: (paid) => {
      queryClient.setQueryData(['booking', bookingId], paid)
      void queryClient.invalidateQueries({ queryKey: ['bookings'] })
      navigate(`/payment/success?bookingId=${encodeURIComponent(bookingId!)}`, { replace: true })
    },
  })

  const sent = send.data
  const header = <AppHeader title="GCash payment (demo)" onBack={() => navigate(-1)} />

  function onSend(e: FormEvent) {
    e.preventDefault()
    if (!MOBILE.test(mobile)) {
      setFieldError('Enter an 11-digit mobile number that starts with 09.')
      return
    }
    setFieldError(null)
    setCode('')
    confirm.reset()
    send.mutate()
  }

  function onConfirm(e: FormEvent) {
    e.preventDefault()
    if (!/^\d{6}$/.test(code)) {
      setFieldError('Enter the 6-digit code.')
      return
    }
    setFieldError(null)
    confirm.mutate()
  }

  if (!bookingId) {
    return (
      <AppShell showBottomNav={false} webFrame webWidth="max-w-2xl" header={header}>
        <div className="flex flex-col gap-4 p-4">
          <p className="text-body text-danger">We couldn&apos;t find the booking to pay for.</p>
          <Button type="button" variant="outline" onClick={() => navigate('/booking/history')}>
            Go to My bookings
          </Button>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell showBottomNav={false} webFrame webWidth="max-w-2xl" header={header}>
      <div className="flex flex-col gap-5 p-4">
        <p role="note" className="flex items-start gap-3 rounded-xl bg-status-pending-bg p-4 text-body text-status-pending-fg">
          <FlaskConical size={22} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            <span className="font-semibold">Demo payment.</span> This stands in for GCash. The code is real, but no money moves.
          </span>
        </p>

        {booking && (
          <section aria-labelledby="sim-amount" className="rounded-2xl border-t-[3px] border-gold bg-paper-deep p-5">
            <h2 id="sim-amount" className="text-note text-ink-muted">{SACRAMENT_LABEL[booking.sacrament]} fee</h2>
            <p className="mt-1 font-sans text-amount tabular-nums text-ink">{peso(booking.amountDueCentavos ?? 0)}</p>
          </section>
        )}

        {!sent && (
          <form onSubmit={onSend} className="flex flex-col gap-4" noValidate>
            <Field id="sim-mobile" label="Mobile number" required description="We will text a 6-digit code to this number." error={fieldError ?? undefined}>
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
          <form onSubmit={onConfirm} className="flex flex-col gap-4" noValidate>
            <p role="status" className="flex items-start gap-3 text-body text-ink">
              <MessageSquareText size={22} className="mt-0.5 shrink-0 text-navy" aria-hidden="true" />
              <span>
                We {sent.channel === 'sms' ? 'texted' : 'emailed'} a code to <span className="font-semibold">{sent.to}</span>. It expires
                in {Math.round(sent.expiresInSeconds / 60)} minutes.
              </span>
            </p>
            <Field id="sim-code" label="6-digit code" required error={fieldError ?? (confirm.isError ? (confirm.error as Error).message : undefined)}>
              <Input
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              />
            </Field>
            <Button type="submit" size="lg" disabled={confirm.isPending || confirm.isSuccess}>
              {confirm.isPending || confirm.isSuccess ? 'Confirming…' : `Pay ${peso(booking?.amountDueCentavos ?? 0)}`}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={confirm.isPending}
              onClick={() => {
                send.reset()
                setFieldError(null)
              }}
            >
              Use a different number or get a new code
            </Button>
          </form>
        )}

        <Button type="button" variant="ghost" onClick={() => navigate(`/payment/cancelled?bookingId=${encodeURIComponent(bookingId)}`)}>
          Cancel
        </Button>
      </div>
    </AppShell>
  )
}
