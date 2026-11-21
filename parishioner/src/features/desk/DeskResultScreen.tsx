import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Copy } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { ResultMark } from '../../components/shared/ResultMark'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { AppShell } from '../../components/shared/AppShell'
import { AppHeader } from '../../components/shared/AppHeader'
import { createPaymentLink, fetchDeskBooking, markCashReceived } from '../../lib/data/walkIns'
import { formatDate, formatInstant, formatTime, peso } from '../../lib/domain'
import { useBookingStore } from '../../stores/booking-store'
import { useDeskStore } from '../../stores/desk-store'

/** After a walk-in is submitted: the reference, and the GCash QR + link when a fee is due. */
export function DeskResultScreen() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [copied, setCopied] = useState(false)
  const [receipt, setReceipt] = useState('')
  const queryClient = useQueryClient()

  // The walk-in is submitted: whatever happens next (a refresh, the next walk-in) starts clean.
  useEffect(() => {
    useBookingStore.getState().reset()
    useDeskStore.getState().reset()
  }, [])

  const { data: booking, isError, error } = useQuery({
    queryKey: ['desk-booking', id],
    queryFn: () => fetchDeskBooking(id!),
    enabled: !!id,
  })
  const needsPayment = booking?.paymentStatus === 'unpaid'
  const link = useQuery({
    queryKey: ['desk-payment-link', id],
    queryFn: () => createPaymentLink(id!),
    enabled: needsPayment,
    retry: false,
    staleTime: Infinity,
  })
  // The server answers 409 (null here) once PayMongo has confirmed the payment.
  const alreadyPaid = booking?.paymentStatus === 'paid' || link.data === null
  const contactName = booking?.walkInContact?.fullName ?? booking?.user.fullName ?? 'Walk-in'

  // The person pays face to face instead of by GCash: the office takes the cash and marks the booking paid.
  const cash = useMutation({
    mutationFn: () => markCashReceived(id!, receipt),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['desk-booking', id] }),
  })

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <AppShell showBottomNav={false} header={<AppHeader title="Walk-in booked" />}>
      <div className="flex flex-col items-center gap-4 p-6 text-center">
        {isError && <p role="alert" className="text-sm text-danger">Couldn&apos;t load the booking: {(error as Error).message}</p>}
        {!booking && !isError && <p className="text-sm text-ink-muted">Loading…</p>}

        {booking && (
          <>
            <ResultMark tone="done" icon={Check} />
            <h2 className="font-display text-title font-semibold text-navy">Booking submitted</h2>
            <p className="font-mono text-sm text-ink">
              Reference <strong>{booking.referenceNumber}</strong>
            </p>
            <p className="text-sm text-ink-muted">
              {contactName}
              {booking.appointmentDate && booking.appointmentStart
                ? ` · ${formatDate(booking.appointmentDate)} · ${formatTime(booking.appointmentStart)}`
                : booking.isEmergency
                  ? ' · Urgent request'
                  : ''}
            </p>

            {needsPayment && !alreadyPaid ? (
              <section className="flex w-full flex-col items-center gap-3 rounded-2xl border border-line bg-surface p-4">
                <p className="text-sm text-ink-muted">Amount to pay with GCash</p>
                <p className="tabular-nums font-display text-title font-semibold text-navy">{peso(booking.amountDueCentavos ?? 0)}</p>

                {link.isPending && <p className="text-sm text-ink-muted">Preparing the payment link…</p>}
                {link.isError && (
                  <div role="alert" className="text-sm text-danger">
                    <p className="mb-2">{(link.error as Error).message}</p>
                    <Button type="button" onClick={() => link.refetch()}>Try again</Button>
                  </div>
                )}
                {link.data && (
                  <>
                    <div role="img" aria-label="GCash payment QR code" className="rounded-xl bg-surface p-3">
                      <QRCodeSVG value={link.data.checkoutUrl} size={208} />
                    </div>
                    <p className="text-sm text-ink-muted">Scan with the phone of the person paying, or send them the link.</p>
                    <Button asChild size="lg" className="w-full">
                      <a href={link.data.checkoutUrl} target="_blank" rel="noopener noreferrer">
                        Open GCash payment link
                      </a>
                    </Button>
                    <Button type="button" variant="outline" className="w-full" onClick={() => copyLink(link.data!.checkoutUrl)}>
                      <Copy aria-hidden="true" /> {copied ? 'Link copied' : 'Copy link'}
                    </Button>
                  </>
                )}
                {booking.paymentHoldExpiresAt && (
                  <p className="text-sm text-status-pending-fg">Pay by {formatInstant(booking.paymentHoldExpiresAt)} or the slot is released.</p>
                )}
                <div className="mt-2 flex w-full flex-col gap-2 border-t border-line pt-4 text-left">
                  <p className="text-sm font-semibold text-ink">Paying cash at the counter instead?</p>
                  <label htmlFor="cash-receipt" className="text-label text-ink-muted">Receipt number (optional)</label>
                  <Input id="cash-receipt" value={receipt} maxLength={120} onChange={(e) => setReceipt(e.target.value)} autoComplete="off" />
                  <Button type="button" variant="outline" disabled={cash.isPending} loading={cash.isPending} onClick={() => cash.mutate()}>
                    {cash.isPending ? 'Saving…' : 'Cash received: mark as paid'}
                  </Button>
                  {cash.isError && <p role="alert" className="text-sm text-danger">{(cash.error as Error).message}</p>}
                </div>
              </section>
            ) : (
              <p className="text-sm text-ink-muted">
                {alreadyPaid ? 'This booking has already been paid.' : 'No payment is due for this booking.'} The parish office will review it.
              </p>
            )}

            <div className="mt-2 flex w-full flex-col gap-3">
              <Button type="button" size="lg" onClick={() => navigate('/desk')} className="w-full">
                New walk-in booking
              </Button>
            </div>
          </>
        )}
      </div>
    </AppShell>
  )
}
