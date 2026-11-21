import { useQuery } from '@tanstack/react-query'
import { Panel } from '../components/shared/Panel'
import { EmailVerificationBanner } from '../components/shared/EmailVerificationBanner'
import { EmergencyCallRow } from '../components/shared/EmergencyCallRow'
import { fetchBookings } from '../lib/data/bookings'
import { parishToday } from '../lib/domain'
import { useAuthStore } from '../stores/auth-store'
import { nextAction } from '../features/home/nextAction'
import { NextActionCard, NextActionError, NextActionSkeleton } from '../features/home/NextActionCard'
import { BookRow, MoreNeedsYou, QuietRows, ThisWeek, ThisWeekSkeleton } from '../features/home/HomeSections'
import { useUpcomingEvents } from '../features/home/useUpcomingEvents'
import { WebFrame } from './WebFrame'

/** The same sections as the phone Home, arranged in two columns: one IA, two layouts. */
export function WebHome() {
  const user = useAuthStore((s) => s.user)
  const userId = user?.id
  const firstName = user?.fullName.split(' ')[0] ?? 'there'
  const events = useUpcomingEvents()
  const bookings = useQuery({
    queryKey: ['bookings', userId],
    queryFn: () => fetchBookings(userId!),
    enabled: !!userId,
  })
  const loading = bookings.isLoading || events.isLoading
  const action = bookings.data ? nextAction(bookings.data, parishToday()) : null
  const shownId = action && action.kind !== 'none' ? action.booking.id : null

  return (
    <WebFrame width="max-w-5xl">
      <h1 className="mb-6 font-display text-title font-semibold text-navy">Welcome back, {firstName}</h1>
      <EmailVerificationBanner />
      <div aria-busy={loading} className="grid items-start gap-x-8 gap-y-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        {loading && <p className="sr-only">Loading your home</p>}
        <div className="flex flex-col gap-6">
          {/* The next-step card is written in white for a navy surface, so on the desktop page it needs its own panel. */}
          <Panel as="div" className="p-6">
            {bookings.isLoading ? (
              <NextActionSkeleton />
            ) : bookings.isError ? (
              <NextActionError onRetry={() => void bookings.refetch()} />
            ) : (
              action && <NextActionCard action={action} />
            )}
          </Panel>
          {bookings.data && <MoreNeedsYou bookings={bookings.data} shownId={shownId} />}
        </div>
        <div className="flex flex-col gap-6">
          <EmergencyCallRow />
          <BookRow />
          {/* The desktop footer already carries "Support our parish". */}
          <QuietRows />
        </div>
        {/* Under both columns, so the page has no empty corner: the events run two across. */}
        <div className="lg:col-span-2">
          {events.isLoading ? (
            <ThisWeekSkeleton />
          ) : events.isError ? (
            <p className="text-body text-ink">
              We couldn&apos;t load the parish events.{' '}
              <button type="button" onClick={() => void events.refetch()} className="font-semibold text-navy underline underline-offset-4">
                Try again
              </button>
            </p>
          ) : (
            <ThisWeek events={events.data ?? []} wide />
          )}
        </div>
      </div>
    </WebFrame>
  )
}
