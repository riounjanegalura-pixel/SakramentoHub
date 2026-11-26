import type { ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CheckCircle2, Clock, Landmark, ShieldCheck } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AppShell } from '../../../components/shared/AppShell'
import { Button } from '../../../components/ui/button'
import { useParishInfo } from '../../../lib/useParishInfo'
import { AppHeader } from '../../../components/shared/AppHeader'
import { Emblem } from '../../../components/shared/Emblem'
import { useBookingStore } from '../../../stores/booking-store'
import { chooseCashPayment, fetchBooking, initiatePayment } from '../../../lib/data/bookings'
import { redirectTo } from '../../../lib/redirect'
import { HOLD_EXPIRED_NOTE, SACRAMENT_LABEL, formatInstant, officeHoursText, paymentHoldExpired, peso } from '../../../lib/domain'
import type { Booking, ParishInfo } from '../../../lib/types'

/**
 * How a parishioner pays a booking's fee: GCash via PayMongo, or cash at the parish office.
 * Reached right after the wizard's Review step submits a booking whose server-computed fee is > 0, or from
 * Booking History (`?bookingId=`) to finish a payment.
 *
 * "Pay with GCash" asks the backend for a PayMongo checkout session and sends the browser to PayMongo's hosted
 * GCash page. PayMongo returns the parishioner to /payment/success or /payment/cancelled; whether they actually
 * paid is only ever decided by PayMongo's signed webhook on the backend, which those screens re-fetch.
 *
 * "Pay at the parish office" marks the booking `pending_cash`: the slot stays held until the same deadline, and
 * the office records the cash when it is handed over. Until then nothing here says it is paid.
 */
export function PaymentScreen() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [params] = useSearchParams()
  const storeBookingId = useBookingStore((s) => s.bookingId)
  const bookingId = params.get('bookingId') ?? storeBookingId

  const {
    data: booking,
    isPending: bookingLoading,
    isError: bookingError,
  } = useQuery({
    queryKey: ['booking', bookingId],
    queryFn: () => fetchBooking(bookingId!),
    enabled: !!bookingId,
  })

  const { data: parish } = useParishInfo()
  const payMutation = useMutation({
    mutationFn: () => initiatePayment(bookingId!),
    onSuccess: ({ checkoutUrl }) => redirectTo(checkoutUrl),
  })
  const cashMutation = useMutation({
    mutationFn: () => chooseCashPayment(bookingId!),
    onSuccess: (updated) => {
      queryClient.setQueryData(['booking', bookingId], updated)
      void queryClient.invalidateQueries({ queryKey: ['bookings'] })
    },
  })

  const header = <AppHeader title="Payment" onBack={() => navigate(-1)} />

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

  const amountDue = booking?.amountDueCentavos ?? 0
  const hold = booking?.paymentHoldExpiresAt ?? null
  const busy = payMutation.isPending || payMutation.isSuccess || cashMutation.isPending

  // The amount appears once, large, with what it is for: the server's figure, never a total of our own.
  const amount = booking && (
    <section aria-labelledby="amount-heading" className="flex items-center gap-4 rounded-2xl border-t-[3px] border-gold bg-paper-deep p-5">
      <Emblem kind={booking.sacrament} size="sm" />
      <div className="min-w-0 flex-1">
        <h2 id="amount-heading" className="text-note text-ink-muted">
          {SACRAMENT_LABEL[booking.sacrament]} fee{parish?.name ? ` · ${parish.name}` : ''}
        </h2>
        <p className="mt-1 font-sans text-amount tabular-nums text-ink">{peso(amountDue)}</p>
      </div>
    </section>
  )

  const gcashButton = (label: string, variant: 'default' | 'outline' = 'default') => (
    <Button
      type="button"
      size="lg"
      variant={variant}
      // Stays disabled after success too: the browser is navigating away to PayMongo, and a second tap
      // would just re-request. The label says why.
      disabled={busy}
      onClick={() => payMutation.mutate()}
    >
      {payMutation.isPending || payMutation.isSuccess ? 'Opening GCash checkout…' : label}
    </Button>
  )

  return (
    <AppShell showBottomNav={false} webFrame webWidth="max-w-2xl" header={header}>
      <div className="flex flex-col gap-5 p-4">
        {bookingLoading && <p role="status" className="text-body text-ink-muted">Loading your booking…</p>}
        {bookingError && <p role="alert" className="text-body text-danger">Couldn&apos;t load this booking.</p>}

        {booking?.paymentStatus === 'paid' && (
          <>
            <div role="status" className="flex items-center gap-2 rounded-xl bg-status-done-bg p-4 text-body text-status-done-fg">
              <CheckCircle2 size={20} aria-hidden="true" />
              This booking has already been paid.
            </div>
            <Button type="button" onClick={() => navigate(`/booking/history/${booking.id}`)}>
              View booking
            </Button>
          </>
        )}

        {booking && booking.paymentStatus !== 'paid' && booking.paymentStatus !== 'unpaid' && booking.paymentStatus !== 'pending_cash' && (
          <>
            <p className="text-body text-ink">No payment is due for this booking.</p>
            <Button type="button" onClick={() => navigate(`/booking/history/${booking.id}`)}>
              View booking
            </Button>
          </>
        )}

        {booking?.paymentStatus === 'unpaid' && (
          <>
            {amount}
            {hold && (
              <p className="flex items-start gap-3 rounded-xl bg-paper-deep p-4 text-body text-ink">
                <Clock size={22} className="mt-0.5 shrink-0 text-navy" aria-hidden="true" />
                <span>
                  Pay by <span className="font-semibold tabular-nums">{formatInstant(hold)}</span> to keep your slot.
                </span>
              </p>
            )}

            <section aria-labelledby="gcash-heading" className="flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <ShieldCheck size={24} className="mt-0.5 shrink-0 text-navy" aria-hidden="true" />
                <div className="text-body text-ink">
                  <h2 id="gcash-heading" className="font-semibold">Pay securely with GCash</h2>
                  <p className="mt-1">
                    You&apos;ll go to PayMongo&apos;s secure GCash checkout to pay the full amount. Your payment is confirmed
                    automatically, with no receipt to upload. Your booking is already saved: if you leave before paying, you
                    can finish from My bookings.
                  </p>
                </div>
              </div>
              {payMutation.isError && (
                <p role="alert" className="text-body text-danger">{(payMutation.error as Error).message}</p>
              )}
              {gcashButton(`Pay ${peso(amountDue)} with GCash`)}
            </section>

            {/* Cash can be chosen only for a submitted booking: the server refuses it for a returned one. */}
            {booking.status === 'submitted' && (
            <section aria-labelledby="cash-heading" className="flex flex-col gap-3 border-t border-line pt-5">
              <div className="flex items-start gap-3">
                <Landmark size={24} className="mt-0.5 shrink-0 text-navy" aria-hidden="true" />
                <div className="text-body text-ink">
                  <h2 id="cash-heading" className="font-semibold">Or pay in cash at the parish office</h2>
                  <p className="mt-1">
                    Bring the full amount to the office yourself. Your slot is held until the same time
                    {hold ? <> (<span className="tabular-nums">{formatInstant(hold)}</span>)</> : null}; the office gives you a
                    receipt and records your payment.
                  </p>
                </div>
              </div>
              {cashMutation.isError && (
                <p role="alert" className="text-body text-danger">{(cashMutation.error as Error).message}</p>
              )}
              <Button type="button" size="lg" variant="outline" disabled={busy} onClick={() => cashMutation.mutate()}>
                {cashMutation.isPending ? 'Saving your choice…' : 'Pay at the parish office'}
              </Button>
            </section>
            )}
          </>
        )}

        {booking?.paymentStatus === 'pending_cash' && (
          <CashInstructions booking={booking} parish={parish} amount={amount} gcash={gcashButton('Pay with GCash instead', 'outline')}
            gcashError={payMutation.isError ? (payMutation.error as Error).message : null}
            onView={() => navigate(`/booking/history/${booking.id}`)} />
        )}
      </div>
    </AppShell>
  )
}

/**
 * After choosing cash: what to bring, where, and by when. Worded as a promise still to keep, never as a payment
 * made: the office has not received anything yet (PRODUCT.md: never "Payment Successful" for something unverified).
 */
function CashInstructions({ booking, parish, amount, gcash, gcashError, onView }: {
  booking: Booking
  parish: ParishInfo | undefined
  amount: ReactNode
  gcash: ReactNode
  gcashError: string | null
  onView: () => void
}) {
  const hold = booking.paymentHoldExpiresAt
  const lapsed = hold !== null && paymentHoldExpired(booking)
  return (
    <>
      <div role="status" className="rounded-xl bg-status-pending-bg p-4 text-body text-status-pending-fg">
        <p className="font-semibold">You chose to pay at the parish office.</p>
        <p className="mt-1">Not paid yet. Your booking shows Paid once the office records your payment.</p>
      </div>
      {amount}

      {lapsed ? (
        <p className="text-body text-ink-muted">{HOLD_EXPIRED_NOTE}</p>
      ) : (
        <>
          <section aria-labelledby="bring-heading" className="rounded-2xl border border-line bg-surface p-5 text-body text-ink">
            <h2 id="bring-heading" className="font-display text-[1.375rem] leading-[1.3] font-semibold text-navy">What to bring</h2>
            <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
              <li><span className="font-semibold tabular-nums">{peso(booking.amountDueCentavos ?? 0)}</span> in cash</li>
              <li>Your booking reference: <span className="numeric font-semibold">{booking.referenceNumber}</span></li>
            </ul>
          </section>

          <section aria-labelledby="where-heading" className="rounded-2xl border border-line bg-surface p-5 text-body text-ink">
            <h2 id="where-heading" className="font-display text-[1.375rem] leading-[1.3] font-semibold text-navy">Where</h2>
            <p className="mt-2">The parish office{parish?.name ? `, ${parish.name}` : ''}</p>
            {parish?.address && <p>{parish.address}</p>}
            {parish?.workingHours && <p className="tabular-nums">Office hours: {officeHoursText(parish)}</p>}
            {parish?.phone && <p>Questions? Call <a className="font-semibold text-navy underline" href={`tel:${parish.phone}`}>{parish.phone}</a></p>}
          </section>

          {hold && (
            <section aria-labelledby="when-heading" className="flex items-start gap-3 rounded-xl bg-paper-deep p-4 text-body text-ink">
              <Clock size={22} className="mt-0.5 shrink-0 text-navy" aria-hidden="true" />
              <div>
                <h2 id="when-heading" className="font-semibold">By when</h2>
                <p>
                  Pay by <span className="font-semibold tabular-nums">{formatInstant(hold)}</span>. If the office has not
                  received it by then, the booking is cancelled and the time is released.
                </p>
              </div>
            </section>
          )}

          {gcashError && <p role="alert" className="text-body text-danger">{gcashError}</p>}
          {gcash}
        </>
      )}

      <Button type="button" size="lg" onClick={onView}>View booking</Button>
    </>
  )
}
