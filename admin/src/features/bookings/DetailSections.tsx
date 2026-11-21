import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Phone } from 'lucide-react'
import { Disclosure } from '../../components/shared/Disclosure'
import { JourneyRail } from '../../components/shared/JourneyRail'
import { formatManilaTime, formatTime } from '../../lib/domain'
import type { AdminBooking } from '../../lib/types'
import { cn } from '../../lib/utils'
import { FormDetails } from './FormDetails'
import { journeyStages } from './journeyStages'
import { CARD, FOCUS, H2, OUTLINE_BTN } from './parts'

const longDate = (ymd: string) => new Date(`${ymd}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })

/** "December 14, 10:00–11:00 AM": the end's AM/PM is dropped when it matches the start's. */
export function appointmentRange(b: Pick<AdminBooking, 'isEmergency' | 'appointmentDate' | 'appointmentStart' | 'appointmentEnd'>): string {
  if (b.isEmergency) return 'Urgent: danger of death, no appointment time'
  if (!b.appointmentDate || !b.appointmentStart) return 'No appointment yet'
  const start = formatTime(b.appointmentStart)
  if (!b.appointmentEnd || b.appointmentEnd === b.appointmentStart) return `${longDate(b.appointmentDate)}, ${start}`
  const end = formatTime(b.appointmentEnd)
  const shortStart = start.slice(-2) === end.slice(-2) ? start.slice(0, -3) : start
  return `${longDate(b.appointmentDate)}, ${shortStart}–${end}`
}

const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`
const callText = (phone: string) => phone.replace(/^(\d{4})(\d{3})(\d{4})$/, '$1 $2 $3')

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[13px] text-ink-muted">{label}</dt>
      <dd className="mt-px text-[15px] font-medium">{children}</dd>
    </div>
  )
}

/** Who the booking is for, when it is, and how to reach them. The reasons given on a closed booking sit on top. */
export function WhoAndWhen({ booking: b, phone: onPhone }: { booking: AdminBooking; phone?: boolean }) {
  const contact = b.user.phone ?? b.walkInContact?.phone ?? null
  const email = b.user.email ?? b.walkInContact?.email ?? null
  const bookedBy = b.user.fullName ?? b.walkInContact?.fullName ?? null
  const closedReason = (b.status === 'declined' || b.status === 'cancelled') && b.statusReason
  return (
    <section aria-label="Who and when" className={cn(CARD, onPhone ? 'p-4' : 'px-6 py-[18px]')}>
      <h2 className={cn(H2, 'mb-3')}>Who and when</h2>
      {closedReason && (
        <p className="mb-3 rounded-xl bg-status-rejected-bg px-3.5 py-3 text-[14px] text-status-rejected-fg">
          {b.status === 'declined' ? 'Reason for declining' : 'Reason for cancelling'}: {b.statusReason}
        </p>
      )}
      {b.status === 'returned' && b.returnNote && (
        <p className="mb-3 rounded-xl bg-status-pending-bg px-3.5 py-3 text-[14px] text-status-pending-fg">Sent back for changes: {b.returnNote}</p>
      )}
      <dl className="flex flex-col gap-3">
        <Item label={b.sacrament === 'wedding' ? 'Couple' : 'For'}>{b.subjectName}</Item>
        {bookedBy && bookedBy !== b.subjectName && <Item label="Booked by">{bookedBy}</Item>}
        <Item label="Appointment">
          <span className="tabular-nums">{appointmentRange(b)}</span>
        </Item>
        <div>
          <dt className="text-[13px] text-ink-muted">Contact</dt>
          <dd className="mt-1 flex flex-col items-start gap-1.5">
            {contact && (
              <a href={telHref(contact)} className={cn('inline-flex min-h-11 items-center gap-2 px-3.5 text-[14px] lg:min-h-10', OUTLINE_BTN, 'rounded-[10px]', onPhone && 'min-h-12 w-full justify-center rounded-xl text-[15px]', FOCUS)}>
                <Phone size={16} aria-hidden="true" />
                Call {callText(contact)}
              </a>
            )}
            {email && <span className="text-[14px] text-ink-muted [overflow-wrap:anywhere]">{email}</span>}
            {!contact && !email && <span className="text-[14px] text-ink-muted">No contact on file</span>}
          </dd>
        </div>
      </dl>
      {b.channel === 'walk_in' && b.createdBy && (
        <p className="mt-3 text-[13px] text-ink-muted">Entered at the parish desk by {b.createdBy.fullName ?? 'a former staff member'}.</p>
      )}
      {b.checkedInAt && (
        <p className="mt-3 text-[14px] font-medium text-status-confirmed-fg">
          Arrived {formatManilaTime(b.checkedInAt)}, checked in by {b.checkedInBy?.fullName ?? 'staff'}.
        </p>
      )}
    </section>
  )
}

/** The five-stage journey, with the booking's off-path outcomes (declined, cancelled, refund) after it. */
export function ProgressCard({ booking: b, phone }: { booking: AdminBooking; phone?: boolean }) {
  const journey = journeyStages(b)
  return (
    <section aria-label="Progress" className={cn(CARD, phone ? 'px-4 pb-1 pt-4' : 'px-6 pb-2 pt-[18px]')}>
      <h2 className={cn(H2, 'mb-3.5')}>Progress</h2>
      <JourneyRail stages={journey.stages} outcomes={journey.outcomes} />
    </section>
  )
}

/** Progress folds away: the status badge already says where the booking is; the full journey is one tap away. */
export function ProgressDisclosure({ booking: b }: { booking: AdminBooking }) {
  const journey = journeyStages(b)
  const now = journey.stages.find((s) => s.state === 'current') ?? [...journey.stages].reverse().find((s) => s.state === 'done')
  return (
    <Disclosure title="Progress" summary={now?.label ?? 'Not started'}>
      <JourneyRail stages={journey.stages} outcomes={journey.outcomes} />
    </Disclosure>
  )
}

/** What the parishioner filled in: one outer section, and inside it Child, Father, Mother, Sponsors... each closed with a one-line summary. */
export function DetailsCard({ booking: b }: { booking: AdminBooking }) {
  const empty = Object.keys(b.formData).length === 0
  return (
    <Disclosure title="Submitted details" summary={empty ? 'Nothing recorded' : 'Everything the parishioner filled in, by group'}>
      {empty ? (
        <p className="text-[14px] text-ink-muted">No form data recorded.</p>
      ) : (
        <FormDetails collapsible formData={b.formData} sacrament={b.sacrament} hiddenKeys={b.documents.map((d) => d.key)} />
      )}
    </Disclosure>
  )
}

/** The walk-in booking being edited at the desk, linked from the Decision card while it is returned. */
export function WalkInEditLink({ id }: { id: string }) {
  return (
    <p className="mb-3 text-[14px]">
      <Link to={`/walk-in/${id}`} className={`inline-flex min-h-11 items-center font-semibold text-navy underline underline-offset-[3px] ${FOCUS}`}>
        Edit walk-in booking
      </Link>
    </p>
  )
}
