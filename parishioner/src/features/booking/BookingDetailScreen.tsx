import { toast } from 'sonner'
import { useState } from 'react'
import { useNavigate, useParams, type NavigateFunction } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CalendarClock, CheckCircle2 } from 'lucide-react'
import { AppShell } from '../../components/shared/AppShell'
import { Button } from '../../components/ui/button'
import { ConfirmDialog } from '../../components/shared/ConfirmDialog'
import { Seal } from '../../components/shared/Seal'
import { Skeleton } from '../../components/ui/skeleton'
import { StatusPill } from '../../components/shared/StatusPill'
import { JourneyRail } from '../../components/shared/JourneyRail'
import { AppHeader } from '../../components/shared/AppHeader'
import { AppointmentDatePicker } from '../../components/shared/AppointmentDatePicker'
import { TimeSlotPicker } from '../../components/shared/TimeSlotPicker'
import { cancelBooking, fetchBooking, fetchCertificateHtml, rescheduleBooking } from '../../lib/data/bookings'
import { fetchDayAvailability } from '../../lib/data/availability'
import { fetchParishInfo } from '../../lib/data/parish'
import { HOLD_EXPIRED_NOTE, PAYMENT_LABEL, SACRAMENT_LABEL, awaitingPayment, formatDate, formatInstant, formatTime, pastChangeCutoff, paymentHoldExpired, peso } from '../../lib/domain'
import { Emblem } from '../../components/shared/Emblem'
import { Panel } from '../../components/shared/Panel'
import { DateBlock } from '../../components/shared/DateBlock'
import { useIsDesktop } from '../../hooks/useIsDesktop'
import { DayPassCard } from './DayPassCard'
import { DocumentStateLine } from './DocumentStateLine'
import { PreparationCard } from './PreparationCard'
import { ReplaceDocument } from './ReplaceDocument'
import { documentState } from './documentState'
import { journeyStages } from './journeyStages'
import { useHoldExpiry } from '../../hooks/useHoldExpiry'
import { useBookingStore } from '../../stores/booking-store'
import { wizardFor } from './wizard/registry'
import type { Booking, ScheduleContext } from '../../lib/types'

export function resumeBooking(b: Booking, navigate: NavigateFunction, step = 1) {
  const store = useBookingStore.getState()
  store.startBooking(b.sacrament)
  store.updateFormData(b.formData)
  store.setAppointment(b.appointmentDate, b.appointmentStart)
  store.setEditingBookingId(b.status === 'returned' ? b.id : null)
  navigate(`/booking/${b.sacrament}/${step}`)
}

const OPEN = ['draft', 'submitted', 'returned', 'approved']

/** A baptism or a wedding already has its parish form filled in from the answers, from the moment it is submitted. */
function hasFilledForm(b: Booking | undefined): boolean {
  return !!b && ['baptism', 'wedding'].includes(b.sacrament) && ['submitted', 'returned', 'approved', 'completed'].includes(b.status)
}

export function BookingDetailScreen() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [panel, setPanel] = useState<'none' | 'cancel' | 'reschedule'>('none')
  const [reason, setReason] = useState('')
  const [newDate, setNewDate] = useState<string | null>(null)
  const [newStart, setNewStart] = useState<string | null>(null)
  const isDesktop = useIsDesktop()

  const { data: b, isLoading, isError, error, refetch } = useQuery({ queryKey: ['booking', id], queryFn: () => fetchBooking(id!), enabled: !!id })
  const { data: parish } = useQuery({ queryKey: ['parish'], queryFn: fetchParishInfo })
  const { data: certificate } = useQuery({
    queryKey: ['certificate', id],
    queryFn: () => fetchCertificateHtml(id!),
    enabled: !!b?.registerEntry || hasFilledForm(b),
    retry: false,
  })

  const context: ScheduleContext = {
    scheduleType: b?.formData.scheduleType as ScheduleContext['scheduleType'],
    massType: b?.formData.massType as ScheduleContext['massType'],
  }
  const day = useQuery({
    queryKey: ['availability-day', b?.sacrament, newDate, context, b?.id],
    queryFn: () => fetchDayAvailability(b!.sacrament, newDate!, context, b!.id),
    enabled: !!b && !!newDate && panel === 'reschedule',
  })

  const refresh = (updated: Booking) => {
    queryClient.setQueryData(['booking', id], updated)
    queryClient.invalidateQueries({ queryKey: ['bookings'] })
    setPanel('none')
  }
  const cancel = useMutation({ mutationFn: () => cancelBooking(id!, reason.trim()), onSuccess: (updated) => {
      toast.success('Booking cancelled')
      refresh(updated)
    },
  })
  const reschedule = useMutation({ mutationFn: () => rescheduleBooking(id!, newDate!, newStart!),
    onSuccess: (updated) => {
      toast.success('New schedule saved')
      refresh(updated)
    },
  })

  // Decide "is the hold over?" at the moment it ends, not at the next unrelated render.
  useHoldExpiry([b?.paymentHoldExpiresAt], () => {
    queryClient.invalidateQueries({ queryKey: ['booking', id] })
    queryClient.invalidateQueries({ queryKey: ['bookings'] })
  })

  const header = <AppHeader title={b ? SACRAMENT_LABEL[b.sacrament] : 'Booking'} onBack={() => navigate('/booking/history')} />

  if (isLoading) {
    return (
      <AppShell header={header}>
        <div aria-busy="true" className="flex flex-col gap-4 p-4">
          <p role="status" className="sr-only">Loading your booking…</p>
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-56 w-full rounded-xl" />
        </div>
      </AppShell>
    )
  }
  if (isError || !b) {
    return (
      <AppShell header={header}>
        <div role="alert" className="p-4">
          <p className="text-body text-danger">Couldn&apos;t load this booking. Check your connection and try again.</p>
          <p className="sr-only">{(error as Error | null)?.message}</p>
          <Button type="button" variant="outline" className="mt-3" onClick={() => void refetch()}>Try again</Button>
        </div>
      </AppShell>
    )
  }

  const tooLateToChange = pastChangeCutoff(b)
  const definition = wizardFor(b.sacrament)
  const answers = (definition?.steps ?? [])
    .map((step) => ({ title: step.title, rows: step.review?.(b.formData) ?? [] }))
    .filter((s) => s.rows.length > 0)
  const documentsStepNumber = (definition?.steps.findIndex((s) => s.id === 'documents') ?? -1) + 1
  const hasRejectedDocument = (b.documents ?? []).some((d) => d.review?.status === 'rejected')
  const unpaidOpen = (b.status === 'submitted' || b.status === 'returned' || b.status === 'approved') && awaitingPayment(b.paymentStatus)
  const holdExpired = unpaidOpen && paymentHoldExpired(b)
  // The server says when payment is open: with approval first, only after the office approves.
  const payable = unpaidOpen && !holdExpired && b.paymentStatus === 'unpaid' && b.canPayNow !== false
  const payAfterApproval = b.status === 'submitted' && b.paymentStatus === 'unpaid' && b.canPayNow === false
  const cashPending = unpaidOpen && !holdExpired && b.paymentStatus === 'pending_cash'

  const journey = journeyStages(b)
  // The signature (spec section 12): where the booking stands comes first, then its reference, then the details.
  const rail = (
    <section aria-labelledby="journey-heading" className="rounded-2xl border border-line bg-surface p-5">
      <h2 id="journey-heading" className="mb-4 font-display text-[1.375rem] leading-[1.3] font-semibold text-navy">Where it stands</h2>
      <JourneyRail stages={journey.stages} outcomes={journey.outcomes} reference={b.referenceNumber} />
    </section>
  )

  // The rail plus three pieces, rendered in order on a phone and split into columns on a desktop.
  const top = (
    <>
        <section className="rounded-2xl border border-line bg-surface p-5">
          {/* On a desktop the status sits in the header panel above. */}
          {!isDesktop && (
            <div className="mb-2 flex items-center gap-2">
              <StatusPill status={b.status} />
            </div>
          )}
          <p className="flex items-center gap-2 text-body text-ink">
            <CalendarClock size={18} aria-hidden="true" />
            {b.isEmergency
              ? 'Urgent request — the parish will contact you'
              : b.appointmentDate && b.appointmentStart
                ? `${formatDate(b.appointmentDate)} · ${formatTime(b.appointmentStart)}`
                : 'No date chosen yet'}
          </p>
          {b.status === 'completed' && b.registerEntry && b.registerEntry.status !== 'revoked' && (
            <Seal className="mt-4" label="Recorded in the parish register" detail={b.registerEntry.registerNumber} />
          )}
        </section>

        {b.status === 'returned' && b.returnNote && (
          <section className="rounded-2xl border border-status-pending-fg/40 bg-status-pending-bg p-5 text-body">
            <p className="mb-1 font-semibold text-status-pending-fg">The parish office asked for changes</p>
            <p className="mb-3 text-ink">{b.returnNote}</p>
            <Button type="button" onClick={() => resumeBooking(b, navigate)}>
              Update and resubmit
            </Button>
          </section>
        )}

    </>
  )
  const side = (
    <>
        <DayPassCard booking={b} parishName={parish?.name} />
        <PreparationCard booking={b} onUpdated={refresh} collapsible />
    </>
  )
  const payment = b.paymentStatus && b.paymentStatus !== 'not_required' ? (
          <section className="rounded-2xl border border-line bg-surface p-5 text-body">
            <div className="mb-1 flex items-center justify-between">
              <h2 className="font-display text-[1.375rem] leading-[1.3] font-semibold text-navy">Payment</h2>
              <span className="text-ink-muted">{PAYMENT_LABEL[b.paymentStatus]}</span>
            </div>
            {b.amountDueCentavos !== null && <p className="text-amount tabular-nums text-ink">{peso(b.amountDueCentavos)}</p>}
            {b.paymentStatus === 'paid' && (
              <p className="flex items-center gap-1 text-status-done-fg">
                <CheckCircle2 size={16} aria-hidden="true" />{' '}
                {b.paymentMethod === 'cash'
                  ? `Paid in cash at the parish office ${b.paidAt ? formatInstant(b.paidAt) : ''}${b.cashReceiptReference ? ` · Receipt ${b.cashReceiptReference}` : ''}`
                  : `Paid ${b.paidAt ? formatInstant(b.paidAt) : ''} · Ref ${b.paymentReference}`}
              </p>
            )}
            {cashPending && (
              <>
                <p className="mb-2 text-status-pending-fg">
                  Not paid yet. Bring the cash to the parish office
                  {b.paymentHoldExpiresAt ? ` by ${formatInstant(b.paymentHoldExpiresAt)}` : ''} or the slot is released.
                </p>
                <Button type="button" variant="outline" className="w-full" onClick={() => navigate(`/booking/${b.sacrament}/payment?bookingId=${b.id}`)}>
                  What to bring and where
                </Button>
              </>
            )}
            {payable && (
              <>
                {b.paymentHoldExpiresAt && (
                  <p className="mb-2 text-status-pending-fg">Pay by {formatInstant(b.paymentHoldExpiresAt)} or the slot is released.</p>
                )}
                <Button type="button" className="w-full" onClick={() => navigate(`/booking/${b.sacrament}/payment?bookingId=${b.id}`)}>
                  Pay with GCash
                </Button>
              </>
            )}
            {payAfterApproval && (
              <p className="text-ink-muted">
                The parish office is reviewing this booking. You can pay once it is approved, and we will let you know.
              </p>
            )}
            {holdExpired && <p className="text-ink-muted">{HOLD_EXPIRED_NOTE}</p>}
            {b.paymentStatus === 'refund_due' && (
              <p className="text-ink">
                {b.paymentMethod === 'cash' ? 'The parish office will return your cash payment.' : 'The parish office will refund your GCash payment.'}
              </p>
            )}
            {b.paymentStatus === 'refunded' && <p className="text-ink">Refunded · Ref {b.refundReference}</p>}
          </section>
  ) : null
  const rest = (
    <>
        {b.documents && b.documents.length > 0 && (
          <section aria-labelledby="documents-heading" className="rounded-2xl border border-line bg-surface p-5 text-sm">
            <h2 id="documents-heading" className="mb-3 font-display text-[1.375rem] leading-[1.3] font-semibold text-navy">Documents</h2>
            <ul className="flex flex-col gap-3">
              {b.documents.map((doc) => (
                <li key={doc.key}>
                  <p className="text-ink">
                    <span className="capitalize">{doc.label}</span>
                    {!doc.required && <span className="text-ink-muted"> (optional)</span>}
                  </p>
                  <DocumentStateLine state={documentState(doc)} />
                  {/* A document the office sent back is replaced right here, whatever the booking's state (not once it is closed). */}
                  {doc.review?.status === 'rejected' && ['submitted', 'approved', 'returned'].includes(b.status) && (
                    <ReplaceDocument booking={b} doc={doc} onUpdated={refresh} />
                  )}
                </li>
              ))}
            </ul>
            {hasRejectedDocument && b.status === 'returned' && documentsStepNumber > 0 && (
              <Button type="button" variant="outline" className="mt-3" onClick={() => resumeBooking(b, navigate, documentsStepNumber)}>
                Review and send it back
              </Button>
            )}
          </section>
        )}

        {b.status === 'draft' && (
          <Button type="button" onClick={() => resumeBooking(b, navigate)}>
            Continue booking
          </Button>
        )}

        {(b.status === 'declined' || b.status === 'cancelled') && b.statusReason && (
          <section className="rounded-2xl bg-status-rejected-bg p-5 text-body text-status-rejected-fg">
            <p className="font-semibold">{b.status === 'declined' ? 'Reason it was declined' : 'Reason it was cancelled'}</p>
            <p>{b.statusReason}</p>
          </section>
        )}

        {answers.length > 0 && (
          <details className="rounded-2xl border border-line bg-surface p-5 text-sm" open>
            <summary className="cursor-pointer py-3 font-display text-[1.375rem] leading-[1.3] font-semibold text-navy">Your answers</summary>
            {answers.map((section) => (
              <div key={section.title} className="mt-3">
                <p className="mb-1 text-label font-semibold text-ink-muted">{section.title}</p>
                <dl className="flex flex-col gap-1">
                  {section.rows.map(([label, value], i) => (
                    <div key={i} className="flex flex-wrap justify-between gap-x-4 gap-y-0.5">
                      <dt className="min-w-[8rem] flex-1 text-ink-muted">{label}</dt>
                      <dd className="ml-auto max-w-full text-right text-ink">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </details>
        )}

        {(b.status === 'completed' || hasFilledForm(b)) && (
          <section className="rounded-2xl border border-line bg-surface p-5 text-sm">
            <p className="mb-2 font-semibold text-ink">{b.registerEntry ? 'Certificate' : 'Your filled-in form'}</p>
            {certificate ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => window.open(URL.createObjectURL(new Blob([certificate], { type: 'text/html' })), '_blank', 'noopener,noreferrer')}
              >
                {b.registerEntry ? `View certificate ${b.registerEntry.registerNumber}` : 'View and print your form'}
              </Button>
            ) : b.registerEntry ? (
              <p className="text-ink-muted">Your certificate {b.registerEntry.registerNumber} could not be opened just now. Please try again in a moment.</p>
            ) : (
              <p className="text-ink-muted">The parish office hasn&apos;t issued it yet. You&apos;ll get a notification.</p>
            )}
            {b.registerEntry?.status === 'revoked' && (
              <p className="mt-2 text-ink-muted">The parish office withdrew this certificate. Contact the office if you have questions.</p>
            )}
          </section>
        )}

        {(b.status === 'submitted' || b.status === 'approved') && !b.isEmergency && panel !== 'reschedule' &&
          (tooLateToChange ? (
            <p className="flex gap-2 rounded-xl border border-status-pending-fg/40 bg-status-pending-bg p-4 text-sm text-ink">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-status-pending-fg" aria-hidden="true" />
              <span>
                Approved bookings can be rescheduled here until 3 days before the date. To move this one, contact the parish office
                {parish ? ` at ${parish.phone}` : ''}.
              </span>
            </p>
          ) : (
            <Button type="button" variant="outline" onClick={() => setPanel('reschedule')}>
              Reschedule
            </Button>
          ))}

        {panel === 'reschedule' && (
          <section className="rounded-2xl border border-line bg-surface p-5">
            <p id="reschedule-date" className="mb-2 font-semibold text-ink">Pick a new date</p>
            <AppointmentDatePicker
              sacrament={b.sacrament}
              value={newDate ?? undefined}
              onChange={(d) => { setNewDate(d || null); setNewStart(null) }}
              labelId="reschedule-date"
              context={context}
              excludeBookingId={b.id}
            />
            {newDate && (
              <div className="mt-3">
                <p id="reschedule-time" className="mb-2 text-sm text-ink">Start time</p>
                {day.data?.status === 'unavailable'
                  ? <p className="text-sm text-danger">{day.data.reason}</p>
                  : <TimeSlotPicker starts={day.data?.freeStarts ?? []} value={newStart} onChange={setNewStart} labelId="reschedule-time" />}
              </div>
            )}
            {b.status === 'approved' && <p className="mt-3 text-sm text-ink-muted">The parish will review the new schedule again.</p>}
            {reschedule.isError && <p className="mt-2 text-sm text-danger">{(reschedule.error as Error).message}</p>}
            <div className="mt-4 flex gap-3">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setPanel('none')}>Back</Button>
              <Button type="button" disabled={!newDate || !newStart || reschedule.isPending} onClick={() => reschedule.mutate()} className="flex-1">
                {reschedule.isPending ? 'Saving…' : 'Confirm new schedule'}
              </Button>
            </div>
          </section>
        )}

        {OPEN.includes(b.status) && (
          <Button type="button" variant="link" className="text-danger hover:text-danger" onClick={() => setPanel('cancel')}>
            Cancel booking
          </Button>
        )}
    </>
  )

  return (
    <AppShell header={header} webWidth="max-w-6xl">
      {isDesktop ? (
        // Desktop (spec section 12): the journey rail on the left with the day pass under it; the details on the right.
        <div className="flex flex-col gap-6 p-4">
        <Panel as="header" className="flex-row items-center gap-6 p-6">
          <Emblem kind={b.sacrament} size="md" />
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-3">
              <span className="font-display text-display font-semibold">{SACRAMENT_LABEL[b.sacrament]}</span>
              <StatusPill status={b.status} />
            </p>
            <p className="numeric mt-1 text-note text-on-navy">{b.referenceNumber}</p>
          </div>
          {b.appointmentDate && (
            <div className="border-l border-dashed border-on-navy pl-6">
              <DateBlock date={b.appointmentDate} size="lg" className="text-white" />
              {b.appointmentStart && <p className="mt-1 text-center text-note text-on-navy">{formatTime(b.appointmentStart)}</p>}
            </div>
          )}
        </Panel>
        <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
          <div data-column="journey" className="flex flex-col gap-4">
            {rail}
            <aside aria-label="Day pass and preparation" className="flex flex-col gap-4">
              {side}
            </aside>
          </div>
          <div data-column="details" className="flex min-w-0 flex-col gap-4">
            {top}
            {payment}
            {rest}
          </div>
        </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4 p-4">
          {top}
          {payment}
          {rail}
          {side}
          {rest}
        </div>
      )}

      <ConfirmDialog
        open={panel === 'cancel'}
        onOpenChange={(open) => setPanel(open ? 'cancel' : 'none')}
        title="Cancel this booking?"
        description={
          tooLateToChange
            ? `Approved bookings can be cancelled here until 3 days before the date. Please call the parish office${parish ? ` at ${parish.phone}` : ''}.`
            : b.paymentStatus === 'paid'
              ? b.paymentMethod === 'cash'
                ? 'You already paid in cash, so the parish office will return your cash payment.'
                : 'You already paid, so the parish office will refund your GCash payment.'
              : 'Your slot will be released for other parishioners.'
        }
      >
        {!tooLateToChange && (
          <>
            <div>
              <label htmlFor="cancel-reason" className="mb-1 block text-body text-ink">
                Reason <span className="text-danger">(required)</span>
              </label>
              <textarea id="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className="w-full rounded-xl border border-input-border bg-surface p-3 text-body" />
              {cancel.isError && <p role="alert" className="mt-2 text-body text-danger">{(cancel.error as Error).message}</p>}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setPanel('none')}>No, keep it</Button>
              <Button type="button" variant="destructive" className="flex-1" disabled={!reason.trim() || cancel.isPending} onClick={() => cancel.mutate()}>
                Yes, cancel
              </Button>
            </div>
          </>
        )}
        {tooLateToChange && (
          <Button type="button" variant="outline" onClick={() => setPanel('none')}>Close</Button>
        )}
      </ConfirmDialog>
    </AppShell>
  )
}
