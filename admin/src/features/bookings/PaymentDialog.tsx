import { useEffect, useId, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { SACRAMENT_LABEL } from '../../lib/constants'
import { createPaymentLink, markCashReceived } from '../../lib/data/bookings'
import { formatManilaDateTime, paymentHoldExpired, peso } from '../../lib/domain'
import type { AdminBooking } from '../../lib/types'
import { cn } from '../../lib/utils'
import { ActionShell, FieldError, FieldLabel, FOCUS, INPUT, OUTLINE_BTN } from './parts'

const RECEIPT_REF_MAX = 120 // server limit (cash-received validation)

type How = 'cash' | 'gcash'

const OPTIONS: Array<{ value: How; title: string; hint: string }> = [
  { value: 'cash', title: 'Cash at the office', hint: 'Record the cash now.' },
  { value: 'gcash', title: 'GCash link', hint: 'Get a link to open on a phone.' },
]

/**
 * Take payment for a booking waiting on it. Cash is the one payment staff record by hand (the booking becomes paid;
 * approval stays a separate decision); a GCash link is for a walk-in at the counter or a parishioner who lost theirs.
 * A refusal from the server (already paid, hold lapsed) means our copy is out of date, so the booking is re-read.
 */
export function PaymentDialog({
  booking: b,
  open,
  onOpenChange,
  onDone,
}: {
  booking: AdminBooking
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone: (updated: AdminBooking) => void
}) {
  const id = useId()
  const queryClient = useQueryClient()
  const [how, setHow] = useState<How>('cash')
  const [receipt, setReceipt] = useState('')
  const [copied, setCopied] = useState(false)
  const stale = () => queryClient.invalidateQueries({ queryKey: ['admin-booking', b.id] })

  const cash = useMutation({
    mutationFn: () => markCashReceived(b.id, receipt.trim()),
    onSuccess: (updated) => onDone(updated),
    onError: stale,
  })
  const link = useMutation({ mutationFn: () => createPaymentLink(b.id), onError: stale })
  const url = link.data?.checkoutUrl

  useEffect(() => {
    if (open) {
      setHow('cash')
      setReceipt('')
      setCopied(false)
      cash.reset()
      link.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const lapsed = b.status === 'submitted' && paymentHoldExpired(b)
  const due = peso(b.amountDueCentavos ?? 0)

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      setCopied(false) // clipboard blocked: the link is still selectable in the box
    }
  }

  const pending = how === 'cash' ? cash.isPending : link.isPending
  const primary =
    how === 'cash'
      ? { label: cash.isPending ? 'Recording…' : 'Record cash payment', run: () => cash.mutate() }
      : { label: link.isPending ? 'Getting the link…' : url ? 'Get a new link' : 'Get GCash link', run: () => link.mutate() }

  return (
    <ActionShell
      open={open}
      onOpenChange={onOpenChange}
      title={`Take payment for ${b.subjectName}`}
      label="Take payment"
      description={`${SACRAMENT_LABEL[b.sacrament]} · ${due}`}
      footer={
        <>
          <Button type="button" variant="outline" className={cn(OUTLINE_BTN, 'min-h-12 px-[22px]')} onClick={() => onOpenChange(false)}>
            {url || cash.isSuccess ? 'Close' : 'Cancel'}
          </Button>
          <Button type="button" className="min-h-12 rounded-xl px-[22px] text-[15px]" disabled={pending || (how === 'cash' && lapsed)} onClick={primary.run}>
            {primary.label}
          </Button>
        </>
      }
    >
      {lapsed && (
        <p role="note" className="rounded-xl bg-status-pending-bg px-3.5 py-3 text-[14px] leading-normal text-status-pending-fg">
          The hold has lapsed, so this time is no longer held. Do not take the cash: the parishioner needs to make a new booking.
        </p>
      )}
      {!lapsed && b.paymentStatus === 'pending_cash' && (
        <p role="status" className="text-[14px] text-ink">
          The parishioner chose to pay at the parish office
          {b.paymentHoldExpiresAt ? ` by ${formatManilaDateTime(b.paymentHoldExpiresAt)}` : ''}. Take the full amount, {due}, then record it here.
        </p>
      )}

      <div role="radiogroup" aria-label="How they pay" className="flex flex-col gap-2.5">
        {OPTIONS.map((o) => {
          const on = how === o.value
          return (
            <label key={o.value} className={cn('flex cursor-pointer gap-3 rounded-xl bg-surface px-4 py-3.5', on ? 'border-2 border-navy' : 'border border-input-border')}>
              <input type="radio" name={`${id}-how`} value={o.value} checked={on} onChange={() => setHow(o.value)} className={cn('mt-0.5 size-5', FOCUS)} />
              <span>
                <span className="block text-[15px] font-semibold text-ink">{o.title}</span>
                <span className="mt-0.5 block text-[13px] leading-snug text-ink-muted">{o.hint}</span>
              </span>
            </label>
          )
        })}
      </div>

      {how === 'cash' && (
        <div className="flex flex-col gap-1.5">
          <FieldLabel htmlFor={`${id}-receipt`} hint="Optional">Receipt number</FieldLabel>
          <input id={`${id}-receipt`} maxLength={RECEIPT_REF_MAX} value={receipt} placeholder="From the office receipt book" onChange={(e) => setReceipt(e.target.value)} className={cn(INPUT, FOCUS)} />
        </div>
      )}
      {how === 'cash' && cash.isError && <FieldError>{(cash.error as Error).message}</FieldError>}

      {how === 'gcash' && link.isError && <FieldError>{(link.error as Error).message}</FieldError>}
      {how === 'gcash' && url && (
        <div className="flex flex-col gap-2">
          <FieldLabel htmlFor={`${id}-link`} hint={null}>GCash payment link</FieldLabel>
          <input id={`${id}-link`} readOnly value={url} onFocus={(e) => e.currentTarget.select()} className={cn(INPUT, 'font-mono text-[13px]', FOCUS)} />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" className={cn(OUTLINE_BTN, 'min-h-11 px-4')} onClick={() => copy(url)}>
              {copied ? 'Copied' : 'Copy link'}
            </Button>
            <a href={url} target="_blank" rel="noreferrer" className={`inline-flex min-h-11 items-center rounded-xl px-2 text-[15px] font-semibold text-navy underline underline-offset-[3px] ${FOCUS}`}>
              Open payment page
            </a>
          </div>
        </div>
      )}
    </ActionShell>
  )
}
