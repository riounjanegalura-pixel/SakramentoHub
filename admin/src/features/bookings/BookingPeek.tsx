import { useRef, type ReactNode } from 'react'
import { Phone, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { StatusBadge } from '../../components/shared/StatusBadge'
import { SACRAMENT_LABEL } from '../../lib/constants'
import { parishToday, peso } from '../../lib/domain'
import type { AdminBooking } from '../../lib/types'
import { cn } from '../../lib/utils'
import { firstName, nextStep, paymentCell, type PayTone } from './bookingModel'
import { appointmentRange } from './DetailSections'
import { FOCUS } from './parts'

const PAY_TEXT: Record<PayTone, string> = { ok: 'text-status-done-fg', warn: 'text-status-pending-fg', bad: 'text-status-rejected-fg', mute: 'text-ink-muted' }

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line py-3 last:border-b-0">
      <dt className="text-[14px] text-ink-muted">{label}</dt>
      <dd className="m-0 text-right text-[14px] tabular-nums">{children}</dd>
    </div>
  )
}

/**
 * A side panel with the facts a clerk needs at a glance, so the queue is not lost: what this booking waits for, its
 * status, appointment and payment, and one Open booking button to the full page. Escape closes it; the caller
 * returns focus to the row control that opened it through `onCloseAutoFocus`.
 */
export function BookingPeek({ booking, onOpenChange, onOpen, onCloseAutoFocus }: { booking: AdminBooking | null; onOpenChange: (open: boolean) => void; onOpen: (id: string) => void; onCloseAutoFocus?: (event: Event) => void }) {
  // `booking` goes null the moment a close is requested; keep the last one so the content does not blank during the slide-out.
  const lastShown = useRef<AdminBooking | null>(null)
  if (booking) lastShown.current = booking
  const shown = booking ?? lastShown.current
  const phone = shown ? (shown.user.phone ?? shown.walkInContact?.phone ?? null) : null
  const step = shown ? nextStep(shown, Date.now(), parishToday()) : ''
  const pay = shown ? paymentCell(shown) : null
  const quiet = step === 'Nothing left to do'
  const bad = shown?.paymentStatus === 'refund_due'

  return (
    <Sheet open={booking !== null} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        onCloseAutoFocus={onCloseAutoFocus}
        className="w-full gap-[18px] overflow-y-auto p-6 sm:max-w-[440px]"
      >
        {shown && pay && (
          <>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <SheetTitle className="mb-1 font-display text-[24px] font-semibold leading-tight text-navy">{shown.subjectName}</SheetTitle>
                <SheetDescription className="text-[14px] text-ink-muted">
                  {SACRAMENT_LABEL[shown.sacrament]} · <span className="font-mono text-ink" translate="no">{shown.referenceNumber}</span>
                </SheetDescription>
              </div>
              <SheetClose aria-label="Close" className={`-mr-2 -mt-2 flex size-11 shrink-0 items-center justify-center rounded-[10px] text-navy hover:bg-paper ${FOCUS}`}>
                <X size={22} aria-hidden="true" />
              </SheetClose>
            </div>

            <p className={cn('rounded-xl px-4 py-3.5 text-[15px] leading-normal', bad ? 'bg-status-rejected-bg text-status-rejected-fg' : quiet ? 'bg-paper-deep text-ink' : 'bg-status-pending-bg text-status-pending-fg')}>
              {step}
            </p>

            <dl className="flex flex-col">
              <Row label="Status"><StatusBadge status={shown.status} /></Row>
              <Row label="Appointment">{shown.isEmergency ? 'Urgent, no appointment time' : appointmentRange(shown)}</Row>
              <Row label="Payment">
                <span className={cn('font-medium', PAY_TEXT[pay.tone])}>
                  {pay.label}
                  {shown.paymentStatus === 'paid' && shown.amountPaidCentavos !== null ? ` · ${peso(shown.amountPaidCentavos)}` : ''}
                </span>
              </Row>
            </dl>

            <div className="mt-auto flex flex-col gap-2.5">
              <Button type="button" className="min-h-[52px] rounded-xl text-[16px]" onClick={() => onOpen(shown.id)}>
                Open booking
              </Button>
              {phone && (
                <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-input-border bg-surface text-[15px] font-semibold text-navy hover:bg-paper ${FOCUS}`}>
                  <Phone size={18} aria-hidden="true" />
                  Call {firstName(shown.user.fullName ?? shown.walkInContact?.fullName)}
                </a>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
