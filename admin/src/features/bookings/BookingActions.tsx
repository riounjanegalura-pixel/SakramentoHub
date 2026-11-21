import { announceBookingChange } from './announceChange'
import { useId, useState, type ReactNode } from 'react'
import { useMutation } from '@tanstack/react-query'
import { CalendarClock, Check, CircleX, MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { approveBooking, checkInBooking } from '../../lib/data/bookings'
import { parishToday, STATUS_LABEL } from '../../lib/domain'
import type { AdminBooking } from '../../lib/types'
import { cn } from '../../lib/utils'
import { approvalChecks, firstName, leftText, type ApprovalCheck } from './bookingModel'
import { CancelDialog, CompleteDialog, DeclineDialog, RefundDialog, RescheduleDialog, ReturnDialog, SCHEDULE_CONFLICT_REASON } from './BookingDialogs'
import { CARD, DANGER_OUTLINE_BTN, FieldError, FOCUS, H2, OUTLINE_BTN } from './parts'

type Dialog = 'decline' | 'return' | 'cancel' | 'complete' | 'reschedule' | 'refund' | null
type PrimaryKey = 'approve' | 'return' | 'checkin' | 'complete' | 'refund'

export interface DecisionAction {
  key: string
  label: string
  onClick: () => void
  /** Drawn but not available: the reason is in `why`, in words, tied to the control. */
  blocked?: boolean
  why?: string
  pending?: boolean
}

export interface Decision {
  title: string
  checks: ApprovalCheck[]
  /** Items still open on the approve checklist (submitted bookings only). */
  left: number
  /** Words under the title when there is no checklist: what the booking is waiting for. */
  message: string | null
  primary: DecisionAction | null
  /** The other decisions, in the order they are offered. `danger` ones are drawn in the danger colour; `link` ones (Reschedule, Cancel) sit in their own "Change or cancel" row as icon buttons. */
  more: Array<DecisionAction & { danger?: boolean; link?: boolean }>
  error: string | null
  whyId: string
  /** The dialogs for every decision above; render them once, anywhere. */
  dialogs: ReactNode
}

/** Server rule the whole app shares: the day of the appointment, and after it, is when a ceremony can be marked. */
const longDay = (ymd: string) => new Date(`${ymd}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })

/**
 * Everything the Decision card and the phone action bar need, from one place: which decision is the one filled
 * button for this booking, why a blocked one is blocked, and the dialogs behind them. Presentation only; the rules
 * are the server's (BookingStateMachine) and are shown here, never skipped.
 */
export function useDecision(b: AdminBooking, onChanged: (b: AdminBooking) => void): Decision {
  const whyId = useId()
  const [dialog, setDialog] = useState<Dialog>(null)
  const [rescheduleReason, setRescheduleReason] = useState('')
  const changed = (updated: AdminBooking) => {
    announceBookingChange(b, updated)
    onChanged(updated)
  }
  const run = useMutation({ mutationFn: (fn: () => Promise<AdminBooking>) => fn(), onSuccess: changed })
  const done = (updated: AdminBooking) => {
    setDialog(null)
    changed(updated)
  }
  const show = (d: Dialog) => {
    run.reset()
    setDialog(d)
  }

  const today = parishToday()
  const approval = approvalChecks(b)
  const open = ['submitted', 'returned', 'approved', 'draft'].includes(b.status)
  const refundDue = b.paymentStatus === 'refund_due'
  const rejected = b.documents.some((d) => d.review?.status === 'rejected')
  const canReschedule = (b.status === 'submitted' || b.status === 'approved') && !b.isEmergency
  const reachedDay = !!b.appointmentDate && today >= b.appointmentDate
  const canCheckIn = b.status === 'approved' && reachedDay && !b.checkedInAt
  const paymentBlocksApprove = approval.checks.some((c) => c.key === 'payment' && !c.ok)

  let primaryKey: PrimaryKey | null = null
  if (b.status === 'submitted') primaryKey = refundDue ? 'refund' : !paymentBlocksApprove && rejected ? 'return' : 'approve'
  else if (canCheckIn) primaryKey = 'checkin'
  else if (b.status === 'approved') primaryKey = 'complete'
  else if (refundDue) primaryKey = 'refund'

  const approveBlocked = approval.left > 0
  const beforeDay = b.status === 'approved' && !!b.appointmentDate && !reachedDay
  const completeWhy = beforeDay && b.appointmentDate ? `Opens on ${longDay(b.appointmentDate)}, the day of the appointment.` : undefined

  const all: Record<PrimaryKey, DecisionAction> = {
    approve: { key: 'approve', label: 'Approve booking', blocked: approveBlocked, why: approveBlocked ? leftText(approval.left) : undefined, pending: run.isPending, onClick: () => run.mutate(() => approveBooking(b.id)) },
    return: { key: 'return', label: 'Send back to parishioner', onClick: () => show('return') },
    checkin: { key: 'checkin', label: 'Check in', pending: run.isPending, onClick: () => run.mutate(() => checkInBooking(b.id)) },
    complete: { key: 'complete', label: 'Mark completed', blocked: beforeDay, why: completeWhy, onClick: () => show('complete') },
    refund: { key: 'refund', label: 'Record the refund', onClick: () => show('refund') },
  }

  const more: Decision['more'] = []
  const add = (a: DecisionAction & { danger?: boolean; link?: boolean }, k?: PrimaryKey) => {
    if (k && primaryKey === k) return
    more.push(a)
  }
  if (b.status === 'submitted') {
    add(all.approve, 'approve')
    add(all.return, 'return')
  }
  if (b.status === 'submitted' || b.status === 'returned') add({ key: 'decline', label: 'Decline', danger: true, onClick: () => show('decline') })
  if (b.status === 'approved') add(all.complete, 'complete')
  if (refundDue) add(all.refund, 'refund')
  if (canReschedule) add({ key: 'reschedule', label: 'Reschedule', link: true, onClick: () => { setRescheduleReason(''); show('reschedule') } })
  if (open) add({ key: 'cancel', label: 'Cancel booking', danger: true, link: true, onClick: () => show('cancel') })

  const title =
    b.status === 'submitted' ? (approval.left === 0 ? 'Ready to approve' : 'To approve')
    : b.status === 'approved' ? 'Approved'
    : b.status === 'returned' ? 'Waiting for changes'
    : b.status === 'draft' ? 'Not sent yet'
    : STATUS_LABEL[b.status]

  const message =
    b.status === 'returned'
      ? b.channel === 'walk_in'
        ? 'Waiting for the changes to be made at the office desk.'
        : `Waiting for ${firstName(b.user.fullName)} to send the changes.`
      : b.status === 'draft'
        ? 'This booking has not been sent yet.'
        : b.status === 'approved'
          ? b.checkedInAt
            ? 'The party has arrived. Mark it completed after the ceremony.'
            : 'Next: check the party in on the day, then mark it completed.'
          : b.status === 'completed' || b.status === 'declined' || b.status === 'cancelled'
            ? `No decision left: this booking is ${STATUS_LABEL[b.status].toLowerCase()}.`
            : null

  const dialogs = (
    <>
      <DeclineDialog
        booking={b}
        open={dialog === 'decline'}
        onOpenChange={(o) => !o && setDialog(null)}
        onDone={done}
        onOfferDate={canReschedule ? () => { setRescheduleReason(SCHEDULE_CONFLICT_REASON); show('reschedule') } : undefined}
      />
      <ReturnDialog booking={b} open={dialog === 'return'} onOpenChange={(o) => !o && setDialog(null)} onDone={done} />
      <CancelDialog booking={b} open={dialog === 'cancel'} onOpenChange={(o) => !o && setDialog(null)} onDone={done} />
      <CompleteDialog booking={b} open={dialog === 'complete'} onOpenChange={(o) => !o && setDialog(null)} onDone={done} />
      <RefundDialog booking={b} open={dialog === 'refund'} onOpenChange={(o) => !o && setDialog(null)} onDone={done} />
      <RescheduleDialog booking={b} open={dialog === 'reschedule'} onOpenChange={(o) => !o && setDialog(null)} onDone={done} initialReason={rescheduleReason} />
    </>
  )

  return {
    title,
    checks: b.status === 'submitted' ? approval.checks : [],
    left: b.status === 'submitted' ? approval.left : 0,
    message,
    primary: primaryKey ? all[primaryKey] : null,
    more,
    error: run.isError ? (run.error as Error).message : null,
    whyId,
    dialogs,
  }
}

/** The approve checklist: what the system needs, in words, each item done or still to do. */
export function Checklist({ checks, onAction }: { checks: ApprovalCheck[]; onAction: (kind: 'documents' | 'payment') => void }) {
  return (
    <ul aria-label="What approving needs" className="flex flex-col gap-2.5">
      {checks.map((c) => (
        <li key={c.key} className="flex items-start gap-3">
          <span
            role="img"
            aria-label={c.ok ? 'Done' : 'Still to do'}
            className={cn('mt-px flex size-6 shrink-0 items-center justify-center rounded-full border-2', c.ok ? 'border-status-done-fg bg-status-done-fg text-white' : 'border-hollow bg-surface')}
          >
            {c.ok && <Check size={14} strokeWidth={3} aria-hidden="true" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-medium">{c.text}</span>
            {c.sub && <span className="block text-[13px] text-ink-muted">{c.sub}</span>}
          </span>
          {c.action && (
            <button type="button" onClick={() => onAction(c.action!.kind)} className={`inline-flex min-h-11 items-center rounded-md text-[14px] font-semibold text-navy underline underline-offset-[3px] lg:min-h-9 ${FOCUS}`}>
              {c.action.label}
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}

/** Moves keyboard focus and the view to the first document still waiting for a decision. */
export function focusDocuments() {
  const section = document.getElementById('documents')
  if (!section) return
  section.scrollIntoView({ block: 'start' })
  section.querySelector<HTMLElement>('button')?.focus()
}

/**
 * The Decision card (spec section 12). One filled button at most: the decision that moves this booking forward now.
 * When Approve cannot be pressed, the checklist above it says why in words and the button is drawn dimmed with
 * aria-disabled, so it stays reachable and its reason is read out with it.
 */
export function DecisionCard({ booking: b, decision: d, onTakePayment, lead, phone = false }: { booking: AdminBooking; decision: Decision; onTakePayment: () => void; lead?: ReactNode; phone?: boolean }) {
  const refundAmount = b.paymentStatus === 'refund_due'
  return (
    <section aria-label="Decision" className={cn(CARD, phone ? 'px-4 py-[18px]' : 'px-6 py-[22px]')}>
      <div className="flex flex-wrap justify-between gap-x-8 gap-y-5">
        <div className="min-w-0 flex-[1_1_360px]">
          <h2 className={cn(H2, 'mb-2', !phone && 'text-[22px]')}>{d.title}</h2>
          {lead}
          {d.checks.length > 0 && <Checklist checks={d.checks} onAction={(kind) => (kind === 'payment' ? onTakePayment() : focusDocuments())} />}
          {d.message && <p className="text-[15px] text-ink-muted">{d.message}</p>}
          {refundAmount && (
            <p className="mt-3 rounded-xl bg-status-pending-bg px-3.5 py-3 text-[14px] font-medium text-status-pending-fg">
              {b.paymentMethod === 'cash'
                ? 'Refund due. The payment was made in cash at the parish office: return it there, then record it here.'
                : 'Refund due. Refund it in the PayMongo dashboard, then record it here.'}
            </p>
          )}
        </div>

        {!phone && (d.primary || d.more.length > 0) && (
          <div className="flex min-w-60 flex-[0_1_300px] flex-col gap-2.5">
            {d.error && <FieldError>{d.error}</FieldError>}
            {d.primary && (
              <>
                <Button
                  type="button"
                  aria-disabled={d.primary.blocked || undefined}
                  aria-describedby={d.primary.why ? d.whyId : undefined}
                  disabled={d.primary.pending}
                  className={cn('min-h-[52px] rounded-xl text-[16px]', d.primary.blocked && 'cursor-not-allowed opacity-50')}
                  onClick={() => {
                    if (!d.primary!.blocked) d.primary!.onClick()
                  }}
                >
                  {d.primary.pending ? 'Working…' : d.primary.label}
                </Button>
                {d.primary.why && (
                  <p id={d.whyId} className="-mt-1 text-[13px] leading-snug text-ink-muted">
                    {d.primary.why}
                  </p>
                )}
              </>
            )}
            {d.more
              .filter((a) => !a.link)
              .map((a) => (
                <Button
                  key={a.key}
                  type="button"
                  variant="outline"
                  aria-disabled={a.blocked || undefined}
                  className={cn(a.danger ? DANGER_OUTLINE_BTN : OUTLINE_BTN, 'min-h-11 text-[15px]', a.blocked && 'cursor-not-allowed opacity-50')}
                  onClick={() => {
                    if (!a.blocked) a.onClick()
                  }}
                >
                  {a.label}
                </Button>
              ))}
            {d.more.some((a) => a.link) && (
              <div role="group" aria-label="Change or cancel" className="mt-1 flex flex-col gap-2 border-t border-line pt-3.5">
                <p aria-hidden="true" className="text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-muted">Change or cancel</p>
                <div className="grid grid-cols-2 gap-2.5">
                  {d.more
                    .filter((a) => a.link)
                    .map((a) => {
                      const Icon = a.key === 'reschedule' ? CalendarClock : CircleX
                      return (
                        <button
                          key={a.key}
                          type="button"
                          onClick={a.onClick}
                          className={cn(
                            'flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3 text-[15px] font-semibold',
                            a.danger ? 'border-danger/40 bg-surface text-danger hover:bg-status-rejected-bg' : 'border-input-border bg-surface text-navy hover:bg-paper',
                            FOCUS,
                          )}
                        >
                          <Icon size={18} strokeWidth={2.2} aria-hidden="true" />
                          {a.label}
                        </button>
                      )
                    })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}

/**
 * The phone's action bar, fixed above the bottom bar: the one primary decision and a button for the rest. Nothing
 * hides behind a swipe; More actions opens a sheet with every other decision as a full-width row.
 */
export function PhoneActionBar({ decision: d }: { decision: Decision }) {
  const [menu, setMenu] = useState(false)
  if (!d.primary && d.more.length === 0) return null
  return (
    <div className="fixed inset-x-0 bottom-16 z-20 flex flex-col gap-1.5 border-t border-line bg-paper px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] print:hidden">
      {d.error && <FieldError>{d.error}</FieldError>}
      {d.primary?.why && (
        <p id={d.whyId} className="text-center text-[13px] text-ink-muted">
          {d.primary.why}
        </p>
      )}
      <div className="flex gap-2">
        {d.primary ? (
          <Button
            type="button"
            aria-disabled={d.primary.blocked || undefined}
            aria-describedby={d.primary.why ? d.whyId : undefined}
            disabled={d.primary.pending}
            className={cn('min-h-[52px] flex-1 rounded-xl text-[16px]', d.primary.blocked && 'cursor-not-allowed opacity-50')}
            onClick={() => {
              if (!d.primary!.blocked) d.primary!.onClick()
            }}
          >
            {d.primary.pending ? 'Working…' : d.primary.label}
          </Button>
        ) : null}
        {d.more.length > 0 && (
          <Button type="button" variant="outline" aria-label="More actions" className={cn(OUTLINE_BTN, d.primary ? 'size-[52px] shrink-0 p-0' : 'min-h-[52px] flex-1')} onClick={() => setMenu(true)}>
            <MoreHorizontal size={22} strokeWidth={2.4} aria-hidden="true" />
            {!d.primary && 'More actions'}
          </Button>
        )}
      </div>
      <Sheet open={menu} onOpenChange={setMenu}>
        <SheetContent side="bottom" showCloseButton={false} className="gap-3 rounded-t-[20px] bg-paper px-4 pb-6 pt-2.5">
          <div aria-hidden="true" className="mx-auto h-1 w-10 rounded-sm bg-hollow" />
          <SheetTitle className="font-display text-[24px] font-semibold text-navy">More actions</SheetTitle>
          <SheetDescription className="sr-only">Every other decision on this booking.</SheetDescription>
          <div className="flex flex-col gap-2.5">
            {d.more.map((a) => (
              <SheetClose asChild key={a.key}>
                <Button
                  type="button"
                  variant="outline"
                  aria-disabled={a.blocked || undefined}
                  className={cn(a.danger ? DANGER_OUTLINE_BTN : OUTLINE_BTN, 'min-h-[52px] w-full')}
                  onClick={(e) => {
                    if (a.blocked) {
                      e.preventDefault()
                      return
                    }
                    // Let the sheet finish closing before the next one opens, so focus lands in the new one.
                    a.onClick()
                  }}
                >
                  {a.label}
                </Button>
              </SheetClose>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
