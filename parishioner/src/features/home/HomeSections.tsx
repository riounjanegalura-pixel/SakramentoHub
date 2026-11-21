import { EmptyState } from '../../components/shared/EmptyState'
import { Link } from 'react-router-dom'
import { CalendarX, ChevronRight, FileText, HandHeart } from 'lucide-react'
import { DateBlock } from '../../components/shared/DateBlock'
import { Emblem } from '../../components/shared/Emblem'
import { Ticket } from '../../components/shared/Ticket'
import { Skeleton } from '../../components/ui/skeleton'
import { SACRAMENT_LABEL, formatTime, holdLapsed, needsAction } from '../../lib/domain'
import type { Booking, ParishEvent } from '../../lib/types'

const EVENT_WHEN = new Intl.DateTimeFormat('en-PH', {
  timeZone: 'Asia/Manila',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
})

/** "Sat 7 Nov, 4:00 pm" in parish time. */
function eventWhen(iso: string): string {
  const p = Object.fromEntries(EVENT_WHEN.formatToParts(new Date(iso)).map((x) => [x.type, x.value]))
  return `${p.weekday} ${p.day} ${p.month}, ${p.hour}:${p.minute} ${String(p.dayPeriod).toLowerCase()}`
}

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus'
const ROW = `flex min-h-[72px] items-center gap-4 py-3.5 text-ink hover:bg-paper-deep ${FOCUS}`

/** A register rule: a 2 px navy line above a Fraunces section title, the way a ledger starts a new section. */
function SectionHead({ id, children, aside }: { id: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t-2 border-navy pt-3">
      <h2 id={id} className="font-display text-[1.375rem] leading-[1.3] font-semibold text-ink">
        {children}
      </h2>
      {aside}
    </div>
  )
}

/** "1 more needs you": the cover shows the most urgent booking, this says there are others. */
export function MoreNeedsYou({ bookings, shownId }: { bookings: Booking[]; shownId: string | null }) {
  const others = bookings.filter((b) => b.id !== shownId && needsAction(b) !== null).length
  if (others === 0) return null
  return (
    <Link to="/booking/history" className={`-mt-2 flex min-h-14 items-center justify-between gap-3 text-ink ${FOCUS}`}>
      <span className="text-[1.1875rem] font-semibold">{others === 1 ? '1 more booking needs you' : `${others} more bookings need you`}</span>
      <ChevronRight size={22} className="shrink-0 text-navy" aria-hidden="true" />
    </Link>
  )
}

/** The next two appointments as tickets. A lapsed payment hold is not an appointment, so it is left out. */
export function YourAppointments({ bookings, today }: { bookings: Booking[]; today: string }) {
  const next = bookings
    .filter(
      (b) =>
        !!b.appointmentDate &&
        !!b.appointmentStart &&
        b.appointmentDate >= today &&
        ['submitted', 'returned', 'approved'].includes(b.status) &&
        !holdLapsed(b),
    )
    .sort((a, c) => `${a.appointmentDate}${a.appointmentStart}`.localeCompare(`${c.appointmentDate}${c.appointmentStart}`))
    .slice(0, 2)
  if (next.length === 0) return null
  return (
    <section aria-labelledby="home-appointments-heading" className="flex flex-col gap-3">
      <SectionHead id="home-appointments-heading">Your appointments</SectionHead>
      <ul className="flex flex-col gap-3">
        {next.map((b) => (
          <li key={b.id}>
            <Ticket
              kind={b.sacrament}
              date={b.appointmentDate}
              title={SACRAMENT_LABEL[b.sacrament]}
              time={formatTime(b.appointmentStart!)}
              status={b.status}
              reference={b.referenceNumber}
              to={`/booking/history/${b.id}`}
            />
          </li>
        ))}
      </ul>
    </section>
  )
}

/** The one entry to the sacrament list: the list itself lives on Book, so it cannot drift from a copy here. */
export function BookRow() {
  return (
    <Link
      to="/services"
      className={`flex min-h-[88px] flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-line bg-paper-deep p-4 text-ink hover:border-navy ${FOCUS}`}
    >
      <span aria-hidden="true" className="flex shrink-0 -space-x-2">
        <Emblem kind="baptism" size="sm" />
        <Emblem kind="wedding" size="sm" />
      </span>
      <span className="min-w-0 flex-1 basis-28 [overflow-wrap:anywhere]">
        <span className="block font-display text-[1.25rem] leading-tight font-semibold text-navy">Book a sacrament</span>
        <span className="block text-note text-ink-muted">Baptism, wedding, funeral and more</span>
      </span>
      <ChevronRight size={22} className="shrink-0 text-navy" aria-hidden="true" />
    </Link>
  )
}

/** Mass times and parish events, soonest first: three dated rows and a way to the rest. */
export function ThisWeek({ events, wide = false }: { events: ParishEvent[]; /** On a wide page the events run in two columns instead of one long list. */ wide?: boolean }) {
  const soonest = [...events].sort((a, c) => a.date.localeCompare(c.date)).slice(0, 3)
  return (
    <section aria-labelledby="home-parish-heading" className="flex flex-col gap-1">
      <SectionHead
        id="home-parish-heading"
        aside={
          <Link to="/calendar" className={`inline-flex min-h-11 min-w-11 items-center justify-end text-note font-semibold text-navy underline underline-offset-4 ${FOCUS}`}>
            See all
          </Link>
        }
      >
        Coming up at the parish
      </SectionHead>
      {soonest.length === 0 ? (
        <EmptyState icon={CalendarX} title="No upcoming events." className="py-6" />
      ) : (
        <ul className={wide ? 'lg:grid lg:grid-cols-2 lg:gap-x-10' : undefined}>
          {soonest.map((e) => (
            <li key={e.id} className={`flex min-h-[72px] items-center gap-4 border-t border-line py-3 first:border-t-0 ${wide ? 'lg:[&:nth-child(2)]:border-t-0' : ''}`}>
              <DateBlock date={e.date.slice(0, 10)} decorative className="w-[4.25rem] shrink-0 border-r border-line pr-3.5" />
              <span className="min-w-0 flex-1">
                <span className="block text-[1.1875rem] leading-snug font-semibold text-ink">{e.title}</span>
                <span className="block text-note text-ink-muted">
                  <time dateTime={e.date} className="tabular-nums">{eventWhen(e.date)}</time>
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** Documents, and the donation dialog until the owner revises it. */
export function QuietRows({ onDonate }: { onDonate?: () => void }) {
  return (
    <ul className="border-y border-line">
      <li>
        <Link to="/wallet" className={ROW}>
          <FileText size={32} strokeWidth={1.5} className="shrink-0 text-navy" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block text-[1.1875rem] font-semibold">Documents and certificates</span>
            <span className="block text-note text-ink-muted">Your saved documents and certificate requests</span>
          </span>
          <ChevronRight size={22} className="shrink-0 text-navy" aria-hidden="true" />
        </Link>
      </li>
      {onDonate && (
        <li className="border-t border-line">
          <button type="button" onClick={onDonate} className={`${ROW} w-full text-left`}>
            <HandHeart size={32} strokeWidth={1.5} className="shrink-0 text-navy" aria-hidden="true" />
            <span className="min-w-0 flex-1 text-[1.1875rem] font-semibold">Support our parish</span>
            <ChevronRight size={22} className="shrink-0 text-navy" aria-hidden="true" />
          </button>
        </li>
      )}
    </ul>
  )
}

export function ThisWeekSkeleton() {
  return (
    <section>
      <Skeleton className="mb-3 h-6 w-48" />
      <div className="flex flex-col gap-3">
        <Skeleton className="h-[72px] w-full rounded-xl" />
        <Skeleton className="h-[72px] w-full rounded-xl" />
        <Skeleton className="h-[72px] w-full rounded-xl" />
      </div>
    </section>
  )
}
