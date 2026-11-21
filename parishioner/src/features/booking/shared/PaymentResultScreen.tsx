import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Check, Clock, X } from 'lucide-react'
import { AppShell } from '../../../components/shared/AppShell'
import { AppHeader } from '../../../components/shared/AppHeader'
import { Button } from '../../../components/ui/button'
import { ResultMark } from '../../../components/shared/ResultMark'
import { fetchBooking } from '../../../lib/data/bookings'
import { useBookingStore } from '../../../stores/booking-store'
import { useParishInfo } from '../../../lib/useParishInfo'
import { VerifyNumberCard } from './VerifyNumberCard'

/** How often, and how many times, the success page re-checks the booking
 * while waiting for PayMongo's webhook to land (~1 minute in total). */
export const PAYMENT_POLL_INTERVAL_MS = 2000
export const PAYMENT_POLL_MAX_ATTEMPTS = 30

/**
 * Where PayMongo sends the parishioner back after GCash checkout
 * (`success_url` / `cancel_url`, set by PaymentController::initiate).
 *
 * Arriving on /payment/success is NOT proof of payment — anyone can type
 * that URL. Payment is confirmed only by PayMongo's signed webhook on the
 * backend, so this screen polls the booking until `paymentStatus` turns
 * 'paid' (it usually takes a few seconds), and says so honestly if it
 * hasn't yet. The cancelled variant checks once too, in case the payment
 * went through anyway.
 */
export function PaymentResultScreen({ outcome }: { outcome: 'success' | 'cancelled' }) {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const bookingId = params.get('bookingId')
  const resetDraft = useBookingStore((s) => s.reset)

  const attempts = useRef(0)

  // dataUpdatedAt is read (not just data) so every poll re-renders this
  // screen, even when the booking comes back unchanged — that's what lets
  // the "gave up waiting" state below appear once the attempts run out.
  const { data: booking, isError, dataUpdatedAt } = useQuery({
    queryKey: ['booking', bookingId, 'payment-result'],
    queryFn: () => {
      attempts.current += 1
      return fetchBooking(bookingId!)
    },
    enabled: !!bookingId,
    refetchInterval: (query) => {
      if (outcome !== 'success') return false
      if (query.state.data?.paymentStatus === 'paid') return false
      return attempts.current >= PAYMENT_POLL_MAX_ATTEMPTS ? false : PAYMENT_POLL_INTERVAL_MS
    },
  })

  const isPaid = booking?.paymentStatus === 'paid'

  // Demo only (DEMO_PAYMENT_OTP): once PayMongo has confirmed the payment, verify the payer's mobile number with an SMS code.
  // The code does not decide whether the booking is paid; the webhook already did.
  const { data: parish } = useParishInfo()
  const [numberVerified, setNumberVerified] = useState(false)
  const needsNumberCheck = outcome === 'success' && isPaid && !!parish?.demoPaymentOtp && !numberVerified

  // The wizard is finished once the booking is paid — clear the
  // sessionStorage draft so a later booking starts clean.
  useEffect(() => {
    if (isPaid) resetDraft()
  }, [isPaid, resetDraft])

  const stillWaiting = outcome === 'success' && !!booking && !isPaid
  const gaveUp = stillWaiting && dataUpdatedAt > 0 && attempts.current >= PAYMENT_POLL_MAX_ATTEMPTS

  const header = <AppHeader title="Payment" onBack={() => navigate('/home')} />

  return (
    <AppShell showBottomNav={false} webFrame webWidth="max-w-2xl" header={header}>
      <div className="flex flex-col items-center gap-4 p-6 text-center">
        {!bookingId && (
          <p className="text-body text-danger">We couldn&apos;t tell which booking this payment was for.</p>
        )}
        {isError && <p className="text-body text-danger">Couldn&apos;t load your booking. Please check My bookings.</p>}

        {isPaid && needsNumberCheck && bookingId && (
          <VerifyNumberCard bookingId={bookingId} onVerified={() => setNumberVerified(true)} />
        )}

        {isPaid && !needsNumberCheck && (
          <>
            <ResultMark tone="done" icon={Check} />
            <h1 className="font-display text-display-xl font-semibold text-navy">Payment received</h1>
            <p className="text-body text-ink-muted">
              Your GCash payment
              {booking?.amountDueCentavos ? ` of ₱${(booking.amountDueCentavos / 100).toFixed(2)}` : ''} was
              confirmed. The parish office will review your booking and notify you once it&apos;s approved.
            </p>
          </>
        )}

        {stillWaiting && !gaveUp && (
          <>
            <ResultMark tone="wait" icon={Clock} />
            <h1 className="font-display text-display-xl font-semibold text-navy">Confirming your payment…</h1>
            <p className="text-body text-ink-muted" role="status">
              We&apos;re waiting for GCash to confirm your payment. This usually takes a few seconds —
              please don&apos;t pay again. If it takes longer, we&apos;ll send you a notification once
              it&apos;s confirmed.
            </p>
          </>
        )}

        {gaveUp && (
          <>
            <ResultMark tone="wait" icon={Clock} />
            <h1 className="font-display text-display-xl font-semibold text-navy">Payment not confirmed yet</h1>
            <p className="text-body text-ink-muted">
              We haven&apos;t received confirmation from GCash yet. If you completed the payment, it can
              take a few minutes — we&apos;ll notify you as soon as it&apos;s confirmed. Please don&apos;t pay
              again in the meantime.
            </p>
          </>
        )}

        {outcome === 'cancelled' && booking && !isPaid && (
          <>
            <ResultMark tone="stop" icon={X} />
            <h1 className="font-display text-display-xl font-semibold text-navy">Payment not completed</h1>
            <p className="text-body text-ink-muted">
              Your booking is saved, but it can&apos;t be approved until the GCash payment is made. You can
              try again now or finish payment later from My bookings.
            </p>
            <Button type="button" size="lg" className="w-full" onClick={() => navigate(`/booking/${booking.sacrament}/payment?bookingId=${booking.id}`)}>
              Try Again
            </Button>
          </>
        )}

        {booking && (
          <Button type="button" variant="outline" className="w-full" onClick={() => navigate(`/booking/history/${booking.id}`)}>
            View Booking
          </Button>
        )}
        <button type="button" onClick={() => navigate('/home')} className="inline-flex min-h-11 items-center text-body font-semibold text-navy underline underline-offset-4">
          Back to Home
        </button>
      </div>
    </AppShell>
  )
}
