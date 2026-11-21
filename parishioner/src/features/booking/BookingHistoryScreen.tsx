import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, FileText } from 'lucide-react'
import { AppShell } from '../../components/shared/AppShell'
import { AppHeader } from '../../components/shared/AppHeader'
import { NotificationsLink } from '../../components/shared/NotificationsLink'
import { fetchBookings } from '../../lib/data/bookings'
import { useHoldExpiry } from '../../hooks/useHoldExpiry'
import { useAuthStore } from '../../stores/auth-store'
import { BookingListSkeleton, BookingSections, BookingsEmpty, BookingsError } from './BookingList'
import { groupBookings } from './bookingGroups'

export { groupBookings, scheduleText } from './bookingGroups'

/** Documents and certificates are one tap from here, not three deep in Account. */
export function DocumentsRow() {
  return (
    <Link
      to="/wallet"
      className="flex min-h-[72px] items-center gap-4 py-2 text-ink hover:bg-paper-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      <FileText size={32} strokeWidth={1.5} className="shrink-0 text-navy" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block text-[1.1875rem] font-semibold">Documents and certificates</span>
        <span className="block text-note text-ink-muted">Your saved documents and certificate requests</span>
      </span>
      <ChevronRight size={22} className="shrink-0 text-navy" aria-hidden="true" />
    </Link>
  )
}

export function BookingHistoryScreen() {
  const userId = useAuthStore((s) => s.user?.id)
  const { data: bookings, isLoading, isError, refetch } = useQuery({
    queryKey: ['bookings', userId],
    queryFn: () => fetchBookings(userId!),
    enabled: !!userId,
  })
  useHoldExpiry((bookings ?? []).map((b) => b.paymentHoldExpiresAt), () => { refetch() })
  const groups = groupBookings(bookings ?? [])

  return (
    <AppShell header={<AppHeader title="My bookings" subtitle="Requests and appointments" action={<NotificationsLink />} />}>
      <div aria-busy={isLoading} className="flex flex-col gap-7 px-5 py-4">
        <DocumentsRow />
        {isLoading && (
          <>
            <p className="sr-only">Loading your bookings</p>
            <BookingListSkeleton />
          </>
        )}
        {isError && <BookingsError onRetry={() => void refetch()} />}
        {bookings?.length === 0 && <BookingsEmpty />}
        <BookingSections groups={groups} rowTo={(b) => `/booking/history/${b.id}`} />
      </div>
    </AppShell>
  )
}
