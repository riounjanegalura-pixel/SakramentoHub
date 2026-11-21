import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { recordPartialRefund } from '../../lib/data/bookings'
import { formatManilaDate, formatManilaDateTime, paymentHoldExpired, PAYMENT_LABEL, peso } from '../../lib/domain'
import type { AdminBooking, PaymentStatus } from '../../lib/types'
import { cn } from '../../lib/utils'
import { holdLeft, type PillTone } from './bookingModel'
import { CARD, FieldError, FOCUS, H2, INPUT, OUTLINE_BTN, Pill } from './parts'

const REFUND_REF_MAX = 120 // server limit (partial-refund validation)

/** Overpayment follow-up: staff refund the extra in the PayMongo dashboard, then record it here (spec §5.3). */
function PartialRefundForm({ booking, onChanged }: { booking: AdminBooking; onChanged: (b: AdminBooking) => void }) {
  const [reference, setReference] = useState('')
  const [pesos, setPesos] = useState((booking.overpaidCentavos / 100).toFixed(2))
  const centavos = Math.round(Number(pesos) * 100)
  const tooMuch = Number.isFinite(centavos) && centavos > booking.overpaidCentavos
  const valid = reference.trim() !== '' && Number.isFinite(centavos) && centavos >= 1 && !tooMuch

  const record = useMutation({
    mutationFn: () => recordPartialRefund(booking.id, reference.trim(), centavos),
    onSuccess: (updated) => onChanged(updated), // not `onSuccess: onChanged`: TanStack passes extra arguments
  })

  return (
    <div className="mt-4 flex flex-col gap-2 rounded-xl bg-status-pending-bg p-3.5 text-[14px]">
      <p role="status" className="font-semibold text-status-pending-fg">Overpaid by {peso(booking.overpaidCentavos)}</p>
      <p className="text-ink">Refund the extra in the PayMongo dashboard, then record it here.</p>
      <label htmlFor="partial-refund-ref" className="text-ink">PayMongo refund reference</label>
      <input id="partial-refund-ref" maxLength={REFUND_REF_MAX} value={reference} onChange={(e) => setReference(e.target.value)} className={cn(INPUT, FOCUS)} />
      <label htmlFor="partial-refund-amount" className="text-ink">Amount refunded (₱)</label>
      <input id="partial-refund-amount" inputMode="decimal" value={pesos} onChange={(e) => setPesos(e.target.value)} className={cn(INPUT, FOCUS)} />
      {tooMuch && <FieldError>The refund cannot be more than {peso(booking.overpaidCentavos)}.</FieldError>}
      {record.isError && <FieldError>{(record.error as Error).message}</FieldError>}
      <Button type="button" className="min-h-11 self-start rounded-xl text-[15px]" disabled={!valid || record.isPending} onClick={() => record.mutate()}>
        Record partial refund
      </Button>
    </div>
  )
}

const TONE: Record<PaymentStatus, { tone: PillTone; icon: 'check' | 'clock' | 'alert' | 'none' }> = {
  paid: { tone: 'done', icon: 'check' },
  unpaid: { tone: 'pending', icon: 'clock' },
  pending_cash: { tone: 'pending', icon: 'clock' },
  refund_due: { tone: 'rejected', icon: 'alert' },
  refunded: { tone: 'neutral', icon: 'none' },
  not_required: { tone: 'neutral', icon: 'none' },
  void: { tone: 'neutral', icon: 'none' },
}

/** Whether staff can take payment for this booking now. The server allows it only while submitted or returned, within the hold. */
export function canTakePayment(b: AdminBooking): boolean {
  const open = b.status === 'submitted' || b.status === 'returned'
  const waiting = b.paymentStatus === 'unpaid' || b.paymentStatus === 'pending_cash'
  return open && waiting && !(b.status === 'submitted' && paymentHoldExpired(b) && b.paymentStatus === 'unpaid')
}

/**
 * What was due, paid and refunded. GCash is verified by PayMongo's signed webhook, not by staff; cash at the parish
 * office is the one payment staff record, from the Take payment dialog. A refund-due booking is refunded from the
 * Decision card; an overpayment is refunded here.
 */
export function PaymentPanel({ booking, onChanged, onTakePayment }: { booking: AdminBooking; onChanged: (b: AdminBooking) => void; onTakePayment: () => void }) {
  const status = booking.paymentStatus
  const paidInCash = booking.paymentMethod === 'cash'
  const open = booking.status === 'submitted' || booking.status === 'returned'
  const left = holdLeft(booking)
  const amount = status === 'paid' || status === 'refund_due' || status === 'refunded' ? (booking.amountPaidCentavos ?? booking.amountDueCentavos ?? 0) : (booking.amountDueCentavos ?? 0)

  const method =
    status === 'paid' || status === 'refund_due'
      ? `${paidInCash ? 'Cash at the parish office' : 'GCash'}${booking.paidAt ? ` · ${formatManilaDate(booking.paidAt, false)}` : ''}`
      : status === 'unpaid' && open
        ? `Waiting for payment${left ? `. Hold ends ${left}` : ''}`
        : status === 'pending_cash' && open
          ? `Cash at the parish office${left ? `. Hold ends ${left}` : ''}`
          : null

  return (
    <section aria-label="Payment" className={cn(CARD, 'px-6 py-[18px]')}>
      <h2 className={cn(H2, 'mb-2.5')}>Payment</h2>
      {status === null ? (
        <p className="text-[14px] text-ink-muted">Legacy booking (before online payment).</p>
      ) : status === 'not_required' ? (
        <p className="flex items-baseline gap-2.5">
          <span className="text-[17px] font-semibold">No fee</span>
          <Pill tone="neutral" icon="none">Nothing to pay</Pill>
        </p>
      ) : (
        <>
          <p className="flex flex-wrap items-baseline gap-2.5">
            <span className="text-[26px] font-semibold tabular-nums">{peso(amount)}</span>
            <Pill tone={TONE[status].tone} icon={TONE[status].icon}>{PAYMENT_LABEL[status]}</Pill>
          </p>
          {method && <p className="mt-1.5 text-[13px] text-ink-muted">{method}</p>}
        </>
      )}

      <dl className="mt-3 flex flex-col gap-2.5 text-[14px] empty:hidden">
        {booking.amountRefundedCentavos > 0 && (
          <div>
            <dt className="text-[13px] text-ink-muted">Amount refunded</dt>
            <dd className="tabular-nums text-ink">{peso(booking.amountRefundedCentavos)}</dd>
          </div>
        )}
        {booking.paidAt && (
          <div>
            <dt className="text-[13px] text-ink-muted">Paid on</dt>
            <dd className="text-ink">{formatManilaDateTime(booking.paidAt)}</dd>
          </div>
        )}
        {booking.paymentReference && (
          <div>
            <dt className="text-[13px] text-ink-muted">PayMongo payment reference</dt>
            <dd className="font-mono text-ink" translate="no">{booking.paymentReference}</dd>
          </div>
        )}
        {booking.cashReceiptReference && (
          <div>
            <dt className="text-[13px] text-ink-muted">Cash receipt number</dt>
            <dd className="font-mono text-ink" translate="no">{booking.cashReceiptReference}</dd>
          </div>
        )}
        {booking.refundReference && (
          <div>
            <dt className="text-[13px] text-ink-muted">{paidInCash ? 'Refund reference' : 'PayMongo refund reference'}</dt>
            <dd className="font-mono text-ink" translate="no">{booking.refundReference}</dd>
          </div>
        )}
      </dl>

      {booking.overpaidCentavos > 0 && <PartialRefundForm key={booking.overpaidCentavos} booking={booking} onChanged={onChanged} />}
      {canTakePayment(booking) && (
        <Button type="button" variant="outline" className={cn(OUTLINE_BTN, 'mt-3.5 min-h-11 px-4')} onClick={onTakePayment}>
          Take payment
        </Button>
      )}
    </section>
  )
}
