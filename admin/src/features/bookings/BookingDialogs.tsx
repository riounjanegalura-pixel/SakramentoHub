import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { cancelBooking, completeBooking, declineBooking, markRefunded, rescheduleBooking, returnBooking } from '../../lib/data/bookings'
import { fetchAvailability } from '../../lib/data/schedule'
import { formatDate, formatTime, parishToday, peso } from '../../lib/domain'
import type { AdminBooking } from '../../lib/types'
import { cn } from '../../lib/utils'
import { firstName } from './bookingModel'
import { ActionShell, FieldError, FieldLabel, FOCUS, INPUT, OUTLINE_BTN, TEXTAREA } from './parts'

/** Server limits (Admin\BookingController validation rules). */
const REASON_MAX = 500
const RETURN_NOTE_MAX = 1000
const REFUND_REF_MAX = 120
const REFUND_NOTE_MAX = 500

/** The reasons the office gives most often; choosing one fills the box, which stays editable. */
export const DECLINE_SUGGESTIONS = ['Parish schedule conflict', 'Documents do not meet the requirements', 'Not eligible for this sacrament']
/** Pre-filled when the office offers another date instead of declining (the parishioner sees it). */
export const SCHEDULE_CONFLICT_REASON = 'Parish schedule conflict'

interface DialogProps {
  booking: AdminBooking
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called with the booking the server returns once the action worked. */
  onDone: (updated: AdminBooking) => void
}

const BTN = 'min-h-12 px-[22px]'

/** What was paid, said the way the office says it, so a decision that makes a refund due is never a surprise. */
function paidNote(b: AdminBooking, verb: string): string | null {
  if (b.paymentStatus !== 'paid') return null
  return `Paid ${peso(b.amountPaidCentavos ?? b.amountDueCentavos ?? 0)}. ${verb} makes a refund due.`
}

/** Runs one action and keeps its error for the dialog that started it. */
function useAction(onDone: (b: AdminBooking) => void) {
  return useMutation({ mutationFn: (fn: () => Promise<AdminBooking>) => fn(), onSuccess: (updated) => onDone(updated) })
}

/** A reason box with the "Required" label, an instruction-style error and the server's own refusal below it. */
function ReasonField({
  id,
  label,
  value,
  onChange,
  max,
  placeholder,
  hint = 'Required',
  error,
  inputRef,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  max: number
  placeholder: string
  hint?: 'Required' | 'Optional'
  error: string | null
  inputRef?: RefObject<HTMLTextAreaElement | null>
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel htmlFor={id} hint={hint}>{label}</FieldLabel>
      <textarea
        id={id}
        ref={inputRef}
        rows={4}
        maxLength={max}
        value={value}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(e) => onChange(e.target.value)}
        className={cn(TEXTAREA, 'resize-y', FOCUS, error && 'border-danger')}
      />
      {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
    </div>
  )
}

function Note({ children }: { children: ReactNode }) {
  return (
    <p role="note" className="rounded-xl bg-status-pending-bg px-3.5 py-3 text-[14px] leading-normal text-status-pending-fg">
      {children}
    </p>
  )
}

/** Decline, or cancel: both end the booking with a reason the parishioner reads. */
function EndBookingDialog({
  booking: b,
  open,
  onOpenChange,
  onDone,
  kind,
  onOfferDate,
}: DialogProps & { kind: 'decline' | 'cancel'; onOfferDate?: () => void }) {
  const decline = kind === 'decline'
  const id = useId()
  const [reason, setReason] = useState('')
  const [touched, setTouched] = useState(false)
  const field = useRef<HTMLTextAreaElement>(null)
  const run = useAction(onDone)
  useEffect(() => {
    if (open) {
      setReason('')
      setTouched(false)
      run.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const missing = touched && !reason.trim()
  const note = paidNote(b, decline ? 'Declining' : 'Cancelling')
  function submit() {
    if (!reason.trim()) {
      setTouched(true)
      field.current?.focus()
      return
    }
    run.mutate(() => (decline ? declineBooking(b.id, reason.trim()) : cancelBooking(b.id, reason.trim())))
  }

  return (
    <ActionShell
      open={open}
      onOpenChange={onOpenChange}
      title={decline ? 'Decline this booking?' : 'Cancel this booking?'}
      label={decline ? 'Decline this booking' : 'Cancel this booking'}
      description={`${firstName(b.user.fullName)} will see your reason.`}
      footer={
        <>
          <Button type="button" variant="outline" className={cn(OUTLINE_BTN, BTN)} onClick={() => onOpenChange(false)}>
            Keep booking
          </Button>
          <Button type="button" variant="destructive" className={cn('rounded-xl text-[15px]', BTN)} disabled={run.isPending} loading={run.isPending} onClick={submit}>
            {run.isPending ? (decline ? 'Declining…' : 'Cancelling…') : decline ? 'Decline booking' : 'Cancel booking'}
          </Button>
        </>
      }
    >
      <ReasonField
        id={`${id}-reason`}
        label="Reason"
        value={reason}
        onChange={setReason}
        max={REASON_MAX}
        placeholder="Write the reason in plain words"
        error={missing ? 'Write the reason. The parishioner reads it.' : null}
        inputRef={field}
      />
      {decline && (
        <div role="group" aria-label="Suggested reasons" className="flex flex-wrap gap-2">
          {DECLINE_SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setReason(s)}
              className={`inline-flex min-h-11 items-center rounded-[10px] border border-input-border bg-surface px-3 text-[13px] font-medium text-navy hover:bg-paper lg:min-h-9 ${FOCUS}`}
            >
              {s}
            </button>
          ))}
        </div>
      )}
      {decline && onOfferDate && (
        <p className="text-[14px] text-ink">
          The date is the problem?{' '}
          <button type="button" onClick={onOfferDate} className={`inline-flex min-h-11 items-center font-semibold text-navy underline underline-offset-[3px] lg:min-h-8 ${FOCUS}`}>
            Offer another date instead
          </button>
        </p>
      )}
      {note && <Note>{note}</Note>}
      {run.isError && <FieldError>{(run.error as Error).message}</FieldError>}
    </ActionShell>
  )
}

export const DeclineDialog = (p: DialogProps & { onOfferDate?: () => void }) => <EndBookingDialog {...p} kind="decline" />
export const CancelDialog = (p: DialogProps) => <EndBookingDialog {...p} kind="cancel" />

/** Send back for changes. The note is optional only when a document was rejected: the server names those itself. */
export function ReturnDialog({ booking: b, open, onOpenChange, onDone }: DialogProps) {
  const id = useId()
  const [note, setNote] = useState('')
  const [touched, setTouched] = useState(false)
  const field = useRef<HTMLTextAreaElement>(null)
  const run = useAction(onDone)
  const rejected = b.documents.filter((d) => d.review?.status === 'rejected').map((d) => d.label)
  useEffect(() => {
    if (open) {
      setNote('')
      setTouched(false)
      run.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const optional = rejected.length > 0
  const missing = touched && !optional && !note.trim()
  function submit() {
    if (!optional && !note.trim()) {
      setTouched(true)
      field.current?.focus()
      return
    }
    run.mutate(() => returnBooking(b.id, note.trim() || undefined))
  }
  const name = firstName(b.user.fullName)

  return (
    <ActionShell
      open={open}
      onOpenChange={onOpenChange}
      title={`Send back to ${name}?`}
      label="Send back to the parishioner"
      description={`${name} can fix it and send it again.`}
      footer={
        <>
          <Button type="button" variant="outline" className={cn(OUTLINE_BTN, BTN)} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" className={cn('rounded-xl text-[15px]', BTN)} disabled={run.isPending} loading={run.isPending} onClick={submit}>
            {run.isPending ? 'Sending…' : 'Send back'}
          </Button>
        </>
      }
    >
      {optional && (
        <p className="text-[14px] text-ink">
          Rejected documents {name} will be asked to replace: <strong>{rejected.join(', ')}</strong>
        </p>
      )}
      <ReasonField
        id={`${id}-note`}
        label={optional ? 'Anything else to tell them?' : 'What needs to change?'}
        hint={optional ? 'Optional' : 'Required'}
        value={note}
        onChange={setNote}
        max={RETURN_NOTE_MAX}
        placeholder="For example: the groom's CENOMAR is blurry. Please upload a clearer copy."
        error={missing ? 'Write what needs to change. The parishioner reads it.' : null}
        inputRef={field}
      />
      {run.isError && <FieldError>{(run.error as Error).message}</FieldError>}
    </ActionShell>
  )
}

/** Completed is terminal and notifies the parishioner, so it is never one click. */
export function CompleteDialog({ booking: b, open, onOpenChange, onDone }: DialogProps) {
  const run = useAction(onDone)
  useEffect(() => {
    if (open) run.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  return (
    <ActionShell
      open={open}
      onOpenChange={onOpenChange}
      title="Mark this booking completed?"
      label="Mark this booking completed"
      description="This cannot be undone. The parishioner is told, and the parish register entry is made."
      footer={
        <>
          <Button type="button" variant="outline" className={cn(OUTLINE_BTN, BTN)} onClick={() => onOpenChange(false)}>
            Not yet
          </Button>
          <Button type="button" className={cn('rounded-xl text-[15px]', BTN)} disabled={run.isPending} loading={run.isPending} onClick={() => run.mutate(() => completeBooking(b.id))}>
            {run.isPending ? 'Saving…' : 'Mark completed'}
          </Button>
        </>
      }
    >
      <p className="text-[15px] text-ink">
        {b.subjectName}, <span className="font-mono" translate="no">{b.referenceNumber}</span>
      </p>
      {run.isError && <FieldError>{(run.error as Error).message}</FieldError>}
    </ActionShell>
  )
}

/** The refund is made outside the system (cash at the office, or the PayMongo dashboard); this records that it happened. */
export function RefundDialog({ booking: b, open, onOpenChange, onDone }: DialogProps) {
  const id = useId()
  const [reference, setReference] = useState('')
  const [note, setNote] = useState('')
  const [touched, setTouched] = useState(false)
  const run = useAction(onDone)
  const cash = b.paymentMethod === 'cash'
  useEffect(() => {
    if (open) {
      setReference('')
      setNote('')
      setTouched(false)
      run.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  const missing = touched && !reference.trim()
  const amount = peso((b.amountPaidCentavos ?? b.amountDueCentavos ?? 0) - b.amountRefundedCentavos)

  return (
    <ActionShell
      open={open}
      onOpenChange={onOpenChange}
      title={`Record the ${amount} refund`}
      label="Record the refund"
      description={cash ? 'The payment was cash at the parish office. Return it there, then record it here.' : 'Refund it in the PayMongo dashboard, then record it here.'}
      footer={
        <>
          <Button type="button" variant="outline" className={cn(OUTLINE_BTN, BTN)} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            className={cn('rounded-xl text-[15px]', BTN)}
            disabled={run.isPending}
            onClick={() => (reference.trim() ? run.mutate(() => markRefunded(b.id, reference.trim(), note.trim() || undefined)) : setTouched(true))}
          >
            {run.isPending ? 'Saving…' : 'Mark refunded'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor={`${id}-ref`}>{cash ? 'Refund reference' : 'PayMongo refund reference'}</FieldLabel>
        <input id={`${id}-ref`} maxLength={REFUND_REF_MAX} value={reference} aria-invalid={missing ? true : undefined} aria-describedby={missing ? `${id}-ref-error` : undefined} onChange={(e) => setReference(e.target.value)} className={cn(INPUT, FOCUS, missing && 'border-danger')} />
        {missing && <FieldError id={`${id}-ref-error`}>Write the refund reference. It goes in the history.</FieldError>}
      </div>
      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor={`${id}-note`} hint="Optional">Note</FieldLabel>
        <input id={`${id}-note`} maxLength={REFUND_NOTE_MAX} value={note} onChange={(e) => setNote(e.target.value)} className={cn(INPUT, FOCUS)} />
      </div>
      {run.isError && <FieldError>{(run.error as Error).message}</FieldError>}
    </ActionShell>
  )
}

/** Move the appointment (spec §5.1): the same scheduling rules apply; only lead time may be waived. The status stays as it is. */
export function RescheduleDialog({ booking: b, open, onOpenChange, onDone, initialReason = '' }: DialogProps & { initialReason?: string }) {
  const id = useId()
  const [date, setDate] = useState('')
  const [start, setStart] = useState('')
  const [waive, setWaive] = useState(false)
  const [reason, setReason] = useState(initialReason)
  const [touched, setTouched] = useState(false)
  useEffect(() => {
    if (open) {
      setDate('')
      setStart('')
      setWaive(false)
      setReason(initialReason)
      setTouched(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialReason])

  const scheduleType = typeof b.formData.scheduleType === 'string' ? b.formData.scheduleType : undefined
  const massType = typeof b.formData.massType === 'string' ? b.formData.massType : undefined
  const availability = useQuery({
    queryKey: ['admin-availability', b.id, date, waive],
    queryFn: () => fetchAvailability(b.sacrament, date, { scheduleType, massType, excludeBookingId: b.id, waiveLeadTime: waive }),
    enabled: open && date !== '',
  })
  const move = useAction(onDone)
  const starts = availability.data?.freeStarts ?? []
  const name = firstName(b.user.fullName)

  const errors = {
    date: touched && !date ? 'Choose a new date.' : null,
    start: touched && date && !start ? 'Choose a free time.' : null,
    reason: touched && !reason.trim() ? 'Write the reason. The parishioner reads it.' : null,
  }
  function submit() {
    if (!date || !start || !reason.trim()) {
      setTouched(true)
      return
    }
    move.mutate(() => rescheduleBooking(b.id, { appointmentDate: date, appointmentStart: start, reason: reason.trim(), waiveLeadTime: waive }))
  }

  return (
    <ActionShell
      open={open}
      onOpenChange={onOpenChange}
      title="Move to another time"
      label="Reschedule the booking"
      description={
        b.appointmentDate && b.appointmentStart
          ? `${name} is told the new time. Now ${formatDate(b.appointmentDate)}, ${formatTime(b.appointmentStart)}.`
          : `${name} is told the new time.`
      }
      footer={
        <>
          <Button type="button" variant="outline" className={cn(OUTLINE_BTN, BTN)} onClick={() => onOpenChange(false)}>
            Keep current time
          </Button>
          <Button type="button" className={cn('rounded-xl text-[15px]', BTN)} disabled={move.isPending} loading={move.isPending} onClick={submit}>
            {move.isPending ? 'Moving…' : 'Move booking'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor={`${id}-date`}>New date</FieldLabel>
        <input
          id={`${id}-date`}
          type="date"
          min={parishToday()}
          value={date}
          aria-invalid={errors.date ? true : undefined}
          aria-describedby={errors.date ? `${id}-date-error` : undefined}
          onChange={(e) => {
            setDate(e.target.value)
            setStart('')
          }}
          className={cn(INPUT, FOCUS, errors.date && 'border-danger')}
        />
        {errors.date && <FieldError id={`${id}-date-error`}>{errors.date}</FieldError>}
      </div>

      <label className="flex min-h-11 items-center gap-2.5 text-[14px] text-ink">
        <input
          type="checkbox"
          checked={waive}
          onChange={(e) => {
            setWaive(e.target.checked)
            setStart('')
          }}
        />
        Waive the lead-time rule (recorded in the history)
      </label>

      <div role="group" aria-label="Free times" className="flex flex-col gap-1.5">
        <span className="text-[14px] font-medium text-ink">Free times</span>
        {date === '' && <p className="text-[14px] text-ink-muted">Choose a date to see the free times.</p>}
        {date !== '' && availability.isLoading && <p role="status" className="text-[14px] text-ink-muted">Checking the schedule…</p>}
        {availability.isError && <FieldError>{(availability.error as Error).message}</FieldError>}
        {availability.data?.status === 'unavailable' && <p className="text-[14px] text-status-pending-fg">{availability.data.reason}</p>}
        {availability.data && availability.data.status !== 'unavailable' && starts.length === 0 && <p className="text-[14px] text-status-pending-fg">No free times on this date. Choose another date.</p>}
        {starts.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {starts.map((s) => {
              const on = s === start
              return (
                <button
                  key={s}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setStart(s)}
                  className={cn(
                    'min-h-11 rounded-[10px] text-[14px] text-navy',
                    FOCUS,
                    on ? 'border-2 border-navy bg-status-confirmed-bg font-semibold' : 'border border-input-border bg-surface font-medium hover:bg-paper',
                  )}
                >
                  {formatTime(s)}
                </button>
              )
            })}
          </div>
        )}
        {errors.start && <FieldError>{errors.start}</FieldError>}
      </div>

      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor={`${id}-reason`}>Reason</FieldLabel>
        <input
          id={`${id}-reason`}
          type="text"
          maxLength={REASON_MAX}
          value={reason}
          placeholder="For example: the church is closed for repairs"
          aria-invalid={errors.reason ? true : undefined}
          aria-describedby={errors.reason ? `${id}-reason-error` : undefined}
          onChange={(e) => setReason(e.target.value)}
          className={cn(INPUT, FOCUS, errors.reason && 'border-danger')}
        />
        {errors.reason && <FieldError id={`${id}-reason-error`}>{errors.reason}</FieldError>}
      </div>
      {move.isError && <FieldError>{(move.error as Error).message}</FieldError>}
    </ActionShell>
  )
}
