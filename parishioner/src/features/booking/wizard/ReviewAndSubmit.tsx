import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useParishInfo } from '../../../lib/useParishInfo'
import { AlertCircle, ClipboardCheck, Pencil } from 'lucide-react'
import { ApiError } from '../../../lib/api/client'
import { BookingFormStep } from '../../../components/shared/BookingFormStep'
import { saveDraft, submitBooking, updateDraft } from '../../../lib/data/bookings'
import { formatDate, formatTime, peso } from '../../../lib/domain'
import { useAuthStore } from '../../../stores/auth-store'
import { useBookingStore } from '../../../stores/booking-store'
import { useDeskStore } from '../../../stores/desk-store'
import { useServerErrorsStore } from '../../../stores/server-errors-store'
import { DeskContactSection } from '../../desk/DeskContactSection'
import { contactSchema } from '../../desk/contactStep'
import { persistWalkIn, submitWalkInDraft } from '../../desk/deskActions'
import type { Booking } from '../../../lib/types'
import { fullSchema, stepIndexForKey } from './schema'
import { groupServerErrors } from './serverErrors'
import { stepsOf, useWizard } from './WizardContext'
import type { WizardStep } from './types'

interface Problem {
  key: string
  message: string
  /** 0-based index of the step that can fix it. */
  step: number
}

export function ReviewAndSubmit(_props: { step: WizardStep }) {
  const wizard = useWizard()
  const { data: parish } = useParishInfo()
  const { definition, goTo, cancel, back } = wizard
  const desk = wizard.mode === 'desk'
  const steps = stepsOf(wizard)
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const formData = useBookingStore((s) => s.formData)
  const appointmentDate = useBookingStore((s) => s.appointmentDate)
  const appointmentStart = useBookingStore((s) => s.appointmentStart)
  const setBookingId = useBookingStore((s) => s.setBookingId)
  const editingId = useBookingStore((s) => s.editingBookingId)
  const setEditingBookingId = useBookingStore((s) => s.setEditingBookingId)
  const deskContact = useDeskStore((s) => s.contact)
  const linkedAccount = useDeskStore((s) => s.linkedAccount)
  const waiveLeadTime = useDeskStore((s) => s.waiveLeadTime)
  const waiveReason = useDeskStore((s) => s.waiveReason)

  const emergency = definition.sacrament === 'anointing' && formData.inDangerOfDeath === true
  const scheduleIndex = steps.findIndex((s) => s.id === 'schedule')
  const missingSchedule = !emergency && (!appointmentDate || !appointmentStart)

  // The desk swaps step 1, so rules and "Fix" targets come from the steps actually shown.
  const effective = useMemo(() => ({ ...definition, steps }), [definition, steps])
  const problems = useMemo(() => {
    const found: Problem[] = []
    const result = fullSchema(effective).safeParse(formData)
    if (!result.success) {
      for (const issue of result.error.issues) {
        const key = issue.path.map(String).join('.')
        found.push({ key, message: issue.message, step: stepIndexForKey(effective, key) })
      }
    }
    // The contact may have been kept by Back half-typed, so check it here as the step does.
    const contactIssue = deskContact ? contactSchema.omit({ relationship: true }).safeParse(deskContact) : null
    if (desk && !deskContact) found.push({ key: 'contact', message: 'Enter the walk-in contact', step: 0 })
    else if (desk && contactIssue && !contactIssue.success) found.push({ key: 'contact', message: contactIssue.error.issues[0].message, step: 0 })
    if (desk && waiveLeadTime && !waiveReason.trim()) {
      found.push({ key: 'waiver', message: 'Give a reason for waiving the lead time', step: Math.max(scheduleIndex, 0) })
    }
    return found
  }, [effective, formData, desk, deskContact, waiveLeadTime, waiveReason, scheduleIndex])

  const input = { userId: user?.id ?? '', sacrament: definition.sacrament, formData, appointmentDate, appointmentStart }

  // A returned booking is updated in place; otherwise the user's draft is upserted. At the desk a
  // walk-in draft is created once and then updated (see deskActions).
  const persist = (): Promise<Booking> =>
    desk
      ? persistWalkIn({ sacrament: definition.sacrament, formData, appointmentDate, appointmentStart, editingId })
      : editingId
        ? updateDraft(editingId, { formData, appointmentDate, appointmentStart }).catch((error: unknown) => {
            // The remembered booking is gone or no longer editable (submitted or cancelled elsewhere): start a fresh draft.
            if (error instanceof ApiError && (error.status === 404 || (error.status === 422 && Object.keys(error.fieldErrors).length === 0))) {
              setEditingBookingId(null)
              return saveDraft(input)
            }
            throw error
          })
        : saveDraft(input)

  const submit = useMutation({
    mutationFn: async () => {
      const saved = await persist()
      return desk ? submitWalkInDraft(saved.id) : submitBooking(saved.id)
    },
    onSuccess: (booking) => {
      useServerErrorsStore.getState().clear()
      setBookingId(booking.id)
      // The returned booking is submitted again; a later booking must not update it.
      setEditingBookingId(null)
      if (desk) {
        navigate(`/desk/result/${booking.id}`)
        return
      }
      navigate(
        booking.paymentStatus === 'unpaid' && booking.canPayNow !== false
          ? `/booking/${definition.sacrament}/payment?bookingId=${booking.id}`
          : `/booking/${definition.sacrament}/submitted`,
      )
    },
    onError: (error) => {
      // A 422 naming fields: open the earliest step that owns one and show the messages there.
      if (error instanceof ApiError && Object.keys(error.fieldErrors).length > 0) {
        const grouped = groupServerErrors(steps, error.fieldErrors)
        useServerErrorsStore.getState().setAll(grouped.byStep)
        if (grouped.firstIndex !== -1) goTo(grouped.firstIndex + 1)
      }
    },
  })

  // Saving is idempotent; it also returns the server's fee quote. Paused while
  // submitting and after: onSuccess clears editingBookingId, which changes the
  // key, and a refetch then would upsert a brand-new draft.
  const quote = useQuery({
    queryKey: ['draft-quote', editingId, input, desk ? { contact: deskContact, link: linkedAccount?.id ?? null } : null],
    queryFn: persist,
    enabled: !!user && !submit.isPending && !submit.isSuccess && (!desk || !!deskContact),
    staleTime: Infinity,
  })

  const amount = quote.data?.amountDueCentavos ?? null
  // The schedule step's own answers (the funeral Mass place) are read under the Schedule heading.
  const scheduleRows = steps[scheduleIndex]?.review?.(formData) ?? []
  const sections = steps
    .map((step, index) => ({ step, index, rows: step.review?.(formData) ?? [] }))
    .filter((s) => s.rows.length > 0 && s.step.id !== 'schedule')

  const submitLabel = submit.isPending
    ? 'Submitting…'
    : amount !== null && amount > 0 && (desk || !parish?.approvalBeforePayment)
      ? desk
        ? 'Submit & show GCash QR'
        : 'Submit & pay with GCash'
      : 'Submit booking' // online with approval first: just Submit; the pay options come after the office approves

  // A disabled submit says why, next to the button.
  const disabledReason = submit.isPending
    ? null
    : !user
      ? 'Sign in to submit this booking.'
      : problems.length > 0
        ? 'Fix the answers listed above, then submit.'
        : missingSchedule
          ? 'Choose a date and time first.'
          : !quote.isSuccess
            ? 'Working out the fee…'
            : null

  return (
    <BookingFormStep
      onCancel={cancel}
      onBack={back}
      onContinue={() => submit.mutate()}
      continueLabel={submitLabel}
      // The fee must be known before submitting (it decides whether GCash comes next).
      continueDisabled={problems.length > 0 || missingSchedule || submit.isPending || !user || !quote.isSuccess}
      footerNote={
        (disabledReason || submit.isError) && (
          submit.isError ? (
            <p role="alert" className="mb-3 text-sm font-medium text-danger">
              {(submit.error as Error).message} Your answers are kept; try again.
            </p>
          ) : (
            <p role="status" className="mb-3 text-note text-ink-muted">{disabledReason}</p>
          )
        )
      }
    >
      <div>
        <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold text-ink">
          <ClipboardCheck size={20} aria-hidden="true" /> Review your booking
        </h2>
        <p className="mb-4 text-sm text-ink-muted">Check everything once. Tap Edit to change a section.</p>

        {problems.length > 0 && (
          <div role="alert" className="mb-4 rounded-2xl border border-danger bg-status-rejected-bg p-4 text-sm text-status-rejected-fg">
            <p className="mb-2 flex items-center gap-2 font-semibold">
              <AlertCircle size={16} aria-hidden="true" /> A few answers need attention
            </p>
            <ul className="space-y-1">
              {problems.map((p) => (
                <li key={`${p.key}-${p.message}`} className="flex items-center justify-between gap-3">
                  <span>{p.message}</span>
                  <button type="button" onClick={() => goTo(p.step + 1)} className="min-h-[44px] shrink-0 px-2 font-semibold underline">
                    Fix
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {desk && <DeskContactSection onEdit={() => goTo(1)} onEditSchedule={() => goTo(Math.max(scheduleIndex, 0) + 1)} />}

        <section className="mb-3 rounded-2xl border border-line bg-surface p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-semibold text-ink">Schedule</h3>
            {scheduleIndex !== -1 && (
              <button type="button" onClick={() => goTo(scheduleIndex + 1)} className="flex min-h-[44px] items-center gap-1 px-2 text-sm font-medium text-navy">
                <Pencil size={14} aria-hidden="true" /> Edit<span className="sr-only"> schedule</span>
              </button>
            )}
          </div>
          <p className="text-sm text-ink">
            {emergency
              ? desk
                ? 'Urgent — the parish will contact them right away.'
                : 'Urgent — the parish will contact you right away.'
              : appointmentDate && appointmentStart
                ? `${formatDate(appointmentDate)} · ${formatTime(appointmentStart)}`
                : 'No date and time chosen yet.'}
          </p>
          {scheduleRows.length > 0 && (
            <dl className="mt-2 flex flex-col gap-1.5 text-sm">
              {scheduleRows.map(([label, value], i) => (
                <div key={i} className="flex justify-between gap-4">
                  <dt className="text-ink-muted">{label}</dt>
                  <dd className="text-right font-medium text-ink">{value}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>

        {sections.map(({ step, index, rows }) => (
          <section key={step.id} className="mb-3 rounded-2xl border border-line bg-surface p-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-semibold text-ink">{step.title}</h3>
              <button type="button" onClick={() => goTo(index + 1)} className="flex min-h-[44px] items-center gap-1 px-2 text-sm font-medium text-navy">
                <Pencil size={14} aria-hidden="true" /> Edit<span className="sr-only"> {step.title}</span>
              </button>
            </div>
            <dl className="flex flex-col gap-1.5 text-sm">
              {rows.map(([label, value], i) => (
                <div key={i} className="flex justify-between gap-4">
                  <dt className="text-ink-muted">{label}</dt>
                  <dd className="text-right font-medium text-ink">{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}

        <section className="mb-3 rounded-2xl bg-navy p-4 text-white">
          <h3 className="text-sm text-white/70">Fee</h3>
          {quote.isError ? (
            <div role="alert" className="mt-1 text-sm">
              <p className="mb-2">
                {quote.error instanceof ApiError && quote.error.status > 0 && quote.error.status !== 429
                  ? `We couldn't work out the fee: ${quote.error.message}`
                  : "We couldn't work out the fee. Check your connection and try again."}
              </p>
              <button
                type="button"
                onClick={() => quote.refetch()}
                className="rounded-full bg-surface px-4 py-1.5 font-semibold text-navy"
              >
                Try again
              </button>
            </div>
          ) : (
            <>
              <p className="tabular-nums text-2xl font-bold text-white">
                {amount === null ? 'Calculating…' : amount > 0 ? peso(amount) : 'No fee'}
              </p>
              <p className="text-sm text-white/70">
                {amount !== null && amount > 0
                  ? desk
                    ? 'A GCash QR code is shown after submitting, to pay on their own phone.'
                    : parish?.approvalBeforePayment
                      ? 'After the parish office approves your booking, you choose to pay by GCash or in cash at the office.'
                      : 'Pay with GCash right after submitting.'
                  : 'Donations are welcome but never required.'}
              </p>
            </>
          )}
        </section>

        {definition.prepare.length > 0 && (
          <section className="mb-3 rounded-2xl bg-line/40 p-4 text-sm">
            <h3 className="mb-2 font-semibold text-ink">{desk ? 'Tell them to prepare' : 'Please prepare'}</h3>
            <ul className="list-disc space-y-1 pl-5 text-ink">
              {definition.prepare.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </BookingFormStep>
  )
}
