import { Link } from 'react-router-dom'
import { AlertCircle, ChevronRight } from 'lucide-react'
import { Emblem } from '../../components/shared/Emblem'
import { StatusPill } from '../../components/shared/StatusPill'
import { Skeleton } from '../../components/ui/skeleton'
import { HOLD_EXPIRED_NOTE, SACRAMENT_LABEL, awaitingPayment, formatInstant, holdLapsed, needsAction } from '../../lib/domain'
import { cn } from '../../lib/utils'
import type { Booking } from '../../lib/types'
import { scheduleText, type BookingGroupTitle } from './bookingGroups'

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus'

interface RowProps {
  booking: Booking
  to: string
  replace?: boolean
  current?: boolean
}

/**
 * One booking as a ruled, whole-row link: sacrament and status, when, the reference number
 * (the one mono line: it is read aloud at the counter), and why it needs you. No card, no shadow, no entry animation.
 */
function BookingRow({ booking: b, to, replace, current }: RowProps) {
  const action = needsAction(b)
  const holdEnds = action !== null && (b.status === 'submitted' || b.status === 'approved') && awaitingPayment(b.paymentStatus) ? b.paymentHoldExpiresAt : null
  const hasDate = !b.isEmergency && !!b.appointmentDate && !!b.appointmentStart
  return (
    <li>
      <Link
        to={to}
        replace={replace}
        aria-current={current ? 'true' : undefined}
        className={cn('flex min-h-[72px] items-start gap-3.5 px-3 py-4 hover:bg-paper-deep', current && 'bg-paper-deep shadow-[inset_3px_0_0_var(--navy)]', FOCUS)}
      >
        <Emblem kind={b.sacrament} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-display text-[1.25rem] leading-tight font-semibold text-navy">{SACRAMENT_LABEL[b.sacrament]}</span>
            <StatusPill status={b.status} />
          </span>
          <span className={cn('block text-body text-ink', hasDate && 'tabular-nums')}>{scheduleText(b)}</span>
          <span className="numeric block text-note text-ink-muted">{b.referenceNumber}</span>
          {holdLapsed(b) && <span className="mt-1 block text-note text-ink-muted">{HOLD_EXPIRED_NOTE}</span>}
          {action && (
            <span className="mt-1 flex items-start gap-1.5 text-note font-semibold text-status-pending-fg">
              <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>{action}</span>
            </span>
          )}
          {holdEnds && <span className="tabular-nums mt-0.5 block text-note text-ink-muted">Hold ends {formatInstant(holdEnds)}</span>}
        </span>
        <ChevronRight size={22} className="mt-1 shrink-0 text-navy" aria-hidden="true" />
      </Link>
    </li>
  )
}

interface SectionsProps {
  groups: Array<{ title: BookingGroupTitle; items: Booking[] }>
  /** Where a row goes. */
  rowTo: (b: Booking) => string
  replace?: boolean
  currentId?: string
}

/** Labelled sections ("Needs you", "Upcoming", ...), each a real list under an h2. Empty sections are not rendered. */
export function BookingSections({ groups, rowTo, replace, currentId }: SectionsProps) {
  return (
    <>
      {groups.map((group) => {
        const headingId = `bookings-${group.title.replace(/\s+/g, '-').toLowerCase()}`
        return (
          <section key={group.title} aria-labelledby={headingId}>
            <h2 id={headingId} className="mb-1 border-t-2 border-navy px-3 pt-3 font-display text-[1.375rem] leading-[1.3] font-semibold text-ink">
              {group.title}
            </h2>
            <ul className="divide-y divide-line">
              {group.items.map((b) => (
                <BookingRow key={b.id} booking={b} to={rowTo(b)} replace={replace} current={b.id === currentId} />
              ))}
            </ul>
          </section>
        )
      })}
    </>
  )
}

/** Placeholder in the final layout's shape: two sections of rows. Hidden from assistive tech; the caller adds the sr-only label. */
export function BookingListSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-col gap-6', className)}>
      {[0, 1].map((s) => (
        <div key={s}>
          <Skeleton className="mb-3 h-6 w-28" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-[4.5rem] w-full rounded-xl" />
            <Skeleton className="h-[4.5rem] w-full rounded-xl" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function BookingsError({ onRetry }: { onRetry: () => void }) {
  return (
    <p className="text-body text-danger">
      Couldn&apos;t load your bookings.{' '}
      <button type="button" onClick={onRetry} className={cn('min-h-11 font-semibold underline', FOCUS)}>
        Retry
      </button>
    </p>
  )
}

export function BookingsEmpty() {
  return (
    <div className="rounded-2xl border border-line bg-paper-deep p-6 text-center">
      <p className="font-display text-[1.375rem] font-semibold text-ink">You have no bookings yet.</p>
      <p className="mx-auto mb-4 mt-2 max-w-xs text-body text-ink">
        Requests, payments and appointments for a sacrament are tracked here from the day you send them.
      </p>
      <Link
        to="/services"
        className={cn('inline-flex min-h-12 items-center rounded-xl bg-primary px-5 text-body font-semibold text-primary-foreground', FOCUS)}
      >
        Book a sacrament
      </Link>
    </div>
  )
}
