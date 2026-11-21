import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AppShell } from '../../components/shared/AppShell'
import { EmailVerificationBanner } from '../../components/shared/EmailVerificationBanner'
import { DonateDialog } from '../../components/shared/DonateDialog'
import { EmergencyCallRow } from '../../components/shared/EmergencyCallRow'
import { useAuthStore } from '../../stores/auth-store'
import { fetchBookings } from '../../lib/data/bookings'
import { parishToday } from '../../lib/domain'
import { useParishInfo } from '../../lib/useParishInfo'
import { useUpcomingEvents } from './useUpcomingEvents'
import { nextAction } from './nextAction'
import { HomeCover, NextActionCard, NextActionError, NextActionSkeleton } from './NextActionCard'
import { BookRow, MoreNeedsYou, QuietRows, ThisWeek, ThisWeekSkeleton, YourAppointments } from './HomeSections'

export function HomeScreen() {
  const user = useAuthStore((s) => s.user)
  const userId = user?.id
  const firstName = user?.fullName.split(' ')[0] ?? 'there'
  const { data: parish } = useParishInfo()
  const events = useUpcomingEvents()
  const bookings = useQuery({
    queryKey: ['bookings', userId],
    queryFn: () => fetchBookings(userId!),
    enabled: !!userId,
  })
  const [showDonate, setShowDonate] = useState(false)

  const loading = bookings.isLoading || events.isLoading
  const action = bookings.data ? nextAction(bookings.data, parishToday()) : null
  const shownId = action && action.kind !== 'none' ? action.booking.id : null

  return (
    <AppShell floating={<DonateDialog open={showDonate} onClose={() => setShowDonate(false)} />}>
      <div aria-busy={loading} className="flex flex-col gap-7 pb-6">
        {loading && <p className="sr-only">Loading your home</p>}
        <HomeCover firstName={firstName} parishName={parish?.name}>
          {bookings.isLoading ? (
            <NextActionSkeleton />
          ) : bookings.isError ? (
            <NextActionError onRetry={() => void bookings.refetch()} />
          ) : (
            action && <NextActionCard action={action} />
          )}
        </HomeCover>
        <div className="flex flex-col gap-7 px-5">
          <EmergencyCallRow />
          <EmailVerificationBanner />

          {bookings.data && <MoreNeedsYou bookings={bookings.data} shownId={shownId} />}
          {bookings.data && <YourAppointments bookings={bookings.data} today={parishToday()} />}

          <BookRow />
          <QuietRows onDonate={() => setShowDonate(true)} />

          {events.isLoading ? (
            <ThisWeekSkeleton />
          ) : events.isError ? (
            <section>
              <h2 className="mb-2 text-heading font-semibold text-ink">Coming up at the parish</h2>
              <p className="text-body text-ink">
                We couldn&apos;t load the parish events.{' '}
                <button type="button" onClick={() => void events.refetch()} className="min-h-11 font-semibold text-navy underline underline-offset-4">
                  Try again
                </button>
              </p>
            </section>
          ) : (
            <ThisWeek events={events.data ?? []} />
          )}
        </div>
      </div>
    </AppShell>
  )
}
