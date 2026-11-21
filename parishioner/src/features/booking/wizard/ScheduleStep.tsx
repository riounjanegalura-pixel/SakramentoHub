import { useState } from 'react'
import { useServerErrorsStore } from '../../../stores/server-errors-store'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { useForm, type FieldValues, type UseFormRegister } from 'react-hook-form'
import { ChoiceCards } from '../../../components/fields/ChoiceCards'
import { AlertTriangle, Phone } from 'lucide-react'
import { AppointmentDatePicker } from '../../../components/shared/AppointmentDatePicker'
import { TimeSlotPicker } from '../../../components/shared/TimeSlotPicker'
import { Button } from '../../../components/ui/button'
import { Skeleton } from '../../../components/ui/skeleton'
import { fetchDayAvailability } from '../../../lib/data/availability'
import { fetchServices } from '../../../lib/data/services'
import { fetchParishInfo } from '../../../lib/data/parish'
import { formatDate, formatTime } from '../../../lib/domain'
import { useBookingStore } from '../../../stores/booking-store'
import { useDeskStore } from '../../../stores/desk-store'
import type { ScheduleContext } from '../../../lib/types'
import type { FormValues } from '../../../lib/validation/groups'
import { StepFrame } from './StepFrame'
import { useRegisterDraft } from './useStepForm'
import { useWizard } from './WizardContext'
import type { WizardStep } from './types'

/** `massChoice` (funeral): ask "Where will the Mass be?" above the calendar, since a house Mass changes the free times.
 * The definition adds the `massType` rule to the shape; the step's `clears` is applied when the answer is saved. */
export function scheduleStep(options: { massChoice?: boolean } = {}): WizardStep {
  return {
    id: 'schedule',
    title: 'Date & time',
    shape: { scheduleType: z.enum(['regular', 'special']).nullish() },
    Component: options.massChoice ? ScheduleWithMassView : ScheduleView,
  }
}

function ScheduleWithMassView(props: { step: WizardStep }) {
  return <ScheduleView {...props} massChoice />
}

function EmergencyNotice() {
  const { data: parish } = useQuery({ queryKey: ['parish'], queryFn: fetchParishInfo })
  return (
    <div role="alert" className="rounded-2xl border border-danger bg-status-rejected-bg p-4 text-sm text-status-rejected-fg">
      <p className="mb-2 flex items-center gap-2 font-semibold">
        <AlertTriangle size={18} aria-hidden="true" /> Call the parish now
      </p>
      <p className="mb-3">
        For someone in danger of death, please call the parish office right away. You can still submit this request so the
        priest has the details — it is flagged urgent and skips scheduling.
      </p>
      {parish && (
        <a href={`tel:${parish.phone}`} className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-danger px-4 py-2 font-semibold text-white">
          <Phone size={16} aria-hidden="true" /> {parish.phone}
        </a>
      )}
    </div>
  )
}

function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-danger bg-status-rejected-bg p-3 text-sm text-status-rejected-fg">
      <span>{message} Check your connection and try again; your answers are kept.</span>
      <Button type="button" variant="outline" size="sm" onClick={onRetry} className="shrink-0">
        Try again
      </Button>
    </div>
  )
}

/** The calendar's loading shape: month bar, weekday row and a 5-week grid. */
function CalendarSkeleton() {
  return (
    <div aria-busy="true" className="rounded-2xl border border-line bg-surface p-3">
      <p role="status" className="sr-only">Loading the calendar…</p>
      <div className="mb-3 flex items-center justify-between">
        <Skeleton className="size-9 rounded-xl" />
        <Skeleton className="h-5 w-32" />
        <Skeleton className="size-9 rounded-xl" />
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: 35 }, (_, i) => (
          <Skeleton key={i} className="aspect-square w-full rounded-lg" />
        ))}
      </div>
    </div>
  )
}

function ScheduleView({ step, massChoice = false }: { step: WizardStep; massChoice?: boolean }) {
  const { definition, next, mode } = useWizard()
  const formData = useBookingStore((s) => s.formData)
  const updateFormData = useBookingStore((s) => s.updateFormData)
  const appointmentDate = useBookingStore((s) => s.appointmentDate)
  const appointmentStart = useBookingStore((s) => s.appointmentStart)
  const setAppointment = useBookingStore((s) => s.setAppointment)
  // The booking these answers belong to on the server — a returned booking
  // being edited, or this draft once saved. A returned booking still holds
  // its slot, so without this its own time would be shown as taken.
  const ownBookingId = useBookingStore((s) => s.editingBookingId ?? s.bookingId) ?? undefined
  // Office desk only: staff may waive the lead-time rule for a short-notice walk-in, with a reason (audited).
  const desk = mode === 'desk'
  const waiveLeadTime = useDeskStore((s) => s.waiveLeadTime)
  const waiveReason = useDeskStore((s) => s.waiveReason)
  const setWaiver = useDeskStore((s) => s.setWaiver)
  const waived = desk && waiveLeadTime

  const servicesQuery = useQuery({ queryKey: ['services'], queryFn: fetchServices })
  const services = servicesQuery.data
  const service = services?.find((s) => s.id === definition.sacrament)
  const hasSessions = !!service?.sessionTimes?.length

  const [tried, setTried] = useState(false)
  const [scheduleType, setScheduleType] = useState<ScheduleContext['scheduleType']>(
    (formData.scheduleType as ScheduleContext['scheduleType']) ?? 'regular',
  )
  // Funeral: the Mass place. Changing it drops the chosen slot at once (the free times differ), as `scheduleKeys` intends.
  const massForm = useForm<FieldValues>({ defaultValues: { massType: formData.massType } })
  const registerMass = ((name: string) => massForm.register(name, { onChange: () => setAppointment(null, null) })) as UseFormRegister<FieldValues>
  const massType = massChoice ? ((massForm.watch('massType') || undefined) as ScheduleContext['massType']) : undefined
  const massMissing = massChoice && !massType
  const massServerError = useServerErrorsStore((s) => s.byStep[step.id])?.find((e) => e.path === 'massType')?.message

  const context: ScheduleContext = {
    ...(hasSessions ? { scheduleType } : {}),
    ...(massType ? { massType } : {}),
    ...(waived ? { waiveLeadTime: true } : {}),
  }

  // This step's answers reach the draft on Continue and before Back or a jump; hidden answers are dropped as in useStepForm.
  const save = () => {
    const answers: FormValues = {}
    if (hasSessions) answers.scheduleType = scheduleType
    if (massType) answers.massType = massType
    for (const key of step.clears?.({ ...useBookingStore.getState().formData, ...answers }) ?? []) answers[key] = undefined
    if (Object.keys(answers).length > 0) updateFormData(answers)
  }
  useRegisterDraft(save)

  const emergency = definition.sacrament === 'anointing' && formData.inDangerOfDeath === true

  const day = useQuery({
    queryKey: ['availability-day', definition.sacrament, appointmentDate, context, ownBookingId ?? null],
    queryFn: () => fetchDayAvailability(definition.sacrament, appointmentDate!, context, ownBookingId),
    enabled: !!appointmentDate && !emergency && !!services,
  })

  if (emergency) {
    return (
      <StepFrame onContinue={next}>
        <h2 className="mb-4 border-t-2 border-navy pt-3 font-display text-[1.375rem] leading-[1.3] font-semibold text-ink">Choose a date and time</h2>
        <EmergencyNotice />
      </StepFrame>
    )
  }

  const freeStarts = day.data?.freeStarts ?? []
  const ready = !!appointmentDate && !!appointmentStart && freeStarts.includes(appointmentStart)
  const sessionTime = service?.sessionTimes?.[0]

  // Continue is never disabled: pressing it without a date and time says what is missing.
  const missing = massMissing
    ? 'Choose where the Mass will be'
    : !ready
      ? 'Choose a date and a time to continue.'
      : waived && !waiveReason.trim() ? 'Give a reason for waiving the lead time to continue.' : null

  return (
    <StepFrame
      onContinue={() => {
        if (missing) {
          setTried(true)
          return
        }
        useServerErrorsStore.getState().clearStep('schedule')
        save()
        next()
      }}
    >
      <h2 className="mb-4 border-t-2 border-navy pt-3 font-display text-[1.375rem] leading-[1.3] font-semibold text-ink">Choose a date and time</h2>
      {tried && missing && !massMissing && (
        <p role="alert" className="mb-4 rounded-xl border border-danger bg-status-rejected-bg p-3 text-body font-semibold text-status-rejected-fg">
          {missing}
        </p>
      )}

      {massChoice && (
        <ChoiceCards
          name="massType"
          label="Where will the Mass be?"
          register={registerMass}
          value={massType}
          error={tried && massMissing ? 'Choose where the Mass will be' : massServerError}
          options={[
            { value: 'church', label: 'Church Mass', description: 'At St. Peter the Apostle Parish' },
            { value: 'house', label: 'House Mass', description: 'The priest comes to the wake' },
          ]}
        />
      )}

      {hasSessions && (
        <div role="radiogroup" aria-label="Schedule type" className="mb-4 grid grid-cols-2 gap-3">
          {(
            [
              ['regular', 'Regular Sunday session', `Sundays at ${sessionTime ? formatTime(sessionTime) : ''}`],
              ['special', 'Special schedule', 'Tuesday–Saturday, by appointment'],
            ] as const
          ).map(([value, label, description]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={scheduleType === value}
              onClick={() => {
                setScheduleType(value)
                setAppointment(null, null)
              }}
              className={`flex h-full min-h-[44px] flex-col justify-center text-balance rounded-2xl border bg-surface p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-focus ${scheduleType === value ? 'border-navy ring-1 ring-navy' : 'border-line'}`}
            >
              <span className="block font-medium text-ink">{label}</span>
              <span className="block text-label text-ink-muted">{description}</span>
            </button>
          ))}
        </div>
      )}

      {desk && (
        <div className="mb-4 rounded-xl border border-line bg-surface p-3 text-sm">
          <label className="flex items-start gap-2 text-ink">
            <input
              type="checkbox"
              checked={waiveLeadTime}
              onChange={(e) => {
                setWaiver(e.target.checked, e.target.checked ? waiveReason : '')
                // Without the waiver the chosen day may no longer be allowed.
                if (!e.target.checked) setAppointment(null, null)
              }}
              className="mt-1 h-4 w-4"
            />
            <span>
              Waive the lead-time rule (short-notice booking)
              <span className="block text-label text-ink-muted">
                Working hours, closed dates and the priest&apos;s other appointments still apply. The reason is recorded.
              </span>
            </span>
          </label>
          {waiveLeadTime && (
            <div className="mt-3">
              <label htmlFor="waive-reason" className="mb-1 flex items-baseline gap-2 font-medium text-ink">
                Reason <span className="text-label font-normal text-ink-muted">Required</span>
              </label>
              <textarea
                id="waive-reason"
                value={waiveReason}
                onChange={(e) => setWaiver(true, e.target.value)}
                rows={2}
                maxLength={500}
                className="w-full rounded-lg border border-input-border p-3"
              />
            </div>
          )}
        </div>
      )}

      {massMissing ? (
        <p className="text-sm text-ink-muted">Choose where the Mass will be to see the free dates and times.</p>
      ) : (
        <>
        <p id="appointment-date-label" className="mb-1 flex items-baseline gap-2 text-sm font-medium text-ink">
          Date <span className="text-label font-normal text-ink-muted">Required</span>
        </p>
        {/* The calendar waits for the service: its session times decide the schedule context. */}
        {servicesQuery.isError ? (
          <LoadError message="We couldn't load this service's schedule." onRetry={() => servicesQuery.refetch()} />
        ) : !services ? (
          <CalendarSkeleton />
        ) : (
          <AppointmentDatePicker
            sacrament={definition.sacrament}
            value={appointmentDate ?? undefined}
            onChange={(date) => setAppointment(date || null, null)}
            labelId="appointment-date-label"
            context={context}
            excludeBookingId={ownBookingId}
          />
        )}

        {appointmentDate && (
          <div className="mt-4">
            <p id="appointment-time-label" className="mb-2 flex flex-wrap items-baseline gap-2 text-sm font-medium text-ink">
              Start time on {formatDate(appointmentDate)} <span className="text-label font-normal text-ink-muted">Required</span>
            </p>
            {day.isPending ? (
              <div aria-busy="true" className="grid grid-cols-3 gap-2">
                <p role="status" className="sr-only">Checking free times…</p>
                {Array.from({ length: 6 }, (_, i) => (
                  <Skeleton key={i} className="h-11 w-full rounded-xl" />
                ))}
              </div>
            ) : day.isError ? (
              <LoadError message="We couldn't load the free times for this day." onRetry={() => day.refetch()} />
            ) : day.data?.status === 'unavailable' ? (
              <p className="text-sm font-medium text-danger">{day.data.reason}</p>
            ) : (
              <TimeSlotPicker
                starts={freeStarts}
                value={appointmentStart}
                onChange={(start) => setAppointment(appointmentDate, start)}
                labelId="appointment-time-label"
                durationMinutes={service?.durationMinutes}
              />
            )}
          </div>
        )}
        </>
      )}
    </StepFrame>
  )
}
