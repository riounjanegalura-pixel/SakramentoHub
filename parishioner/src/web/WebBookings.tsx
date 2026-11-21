import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { fetchBooking, fetchBookings } from '../lib/data/bookings'
import { fetchParishInfo } from '../lib/data/parish'
import { DayPassCard } from '../features/booking/DayPassCard'
import { PreparationCard } from '../features/booking/PreparationCard'
import { HOLD_EXPIRED_NOTE, PAYMENT_LABEL, SACRAMENT_LABEL, holdLapsed, needsAction } from '../lib/domain'
import { useHoldExpiry } from '../hooks/useHoldExpiry'
import { useAuthStore } from '../stores/auth-store'
import { groupBookings, scheduleText } from '../features/booking/bookingGroups'
import { BookingListSkeleton, BookingSections, BookingsEmpty, BookingsError } from '../features/booking/BookingList'
import { Skeleton } from '../components/ui/skeleton'
import { WebFrame } from './WebFrame'
import { StatusPill } from '../components/shared/StatusPill'
import { JourneyRail } from '../components/shared/JourneyRail'
import { journeyStages } from '../features/booking/journeyStages'

export function WebBookings() {
  const userId = useAuthStore((s) => s.user?.id)
  const [params] = useSearchParams()
  const { data: bookings, isLoading, isError, refetch } = useQuery({
    queryKey: ['bookings', userId],
    queryFn: () => fetchBookings(userId!),
    enabled: !!userId,
  })
  useHoldExpiry((bookings ?? []).map((b) => b.paymentHoldExpiresAt), () => { refetch() })

  const groups = groupBookings(bookings ?? [])
  const all = groups.flatMap((g) => g.items)
  const wanted = params.get('selected')
  const selected = all.find((b) => b.id === wanted) ?? all[0]
  const action = selected ? needsAction(selected) : null
  const lapsed = !!selected && holdLapsed(selected)
  const queryClient = useQueryClient()
  // The day pass and checklist come from the full booking, the only response that carries the QR code.
  const full = useQuery({ queryKey: ['booking', selected?.id], queryFn: () => fetchBooking(selected!.id), enabled: !!selected })
  const { data: parish } = useQuery({ queryKey: ['parish'], queryFn: fetchParishInfo })

  return (
    <WebFrame width="max-w-6xl">
      <h1 className="mb-5 font-display text-title font-semibold text-navy">My bookings</h1>
      <div aria-busy={isLoading}>
        {isLoading && (
          <>
            <p className="sr-only">Loading your bookings</p>
            <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
              <BookingListSkeleton />
              <Skeleton className="hidden h-80 w-full rounded-2xl lg:block" />
            </div>
          </>
        )}
        {isError && <BookingsError onRetry={() => void refetch()} />}
        {bookings?.length === 0 && <BookingsEmpty />}
      </div>
      {selected && (
        <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
          <nav aria-label="Bookings" className="flex flex-col gap-5 lg:sticky lg:top-20 lg:self-start">
            <BookingSections groups={groups} rowTo={(b) => '?selected=' + b.id} replace currentId={selected.id} />
          </nav>
          <section aria-label="Booking details" className="grid min-w-0 gap-6 self-start rounded-2xl border border-line bg-surface p-6 lg:grid-cols-[minmax(0,13rem)_minmax(0,1fr)]">
            {/* Spec section 12: the journey rail and the reference on the left, the details on the right (desktop only). */}
            <div data-column="journey" className="min-w-0">
              <JourneyRail {...journeyStages(selected)} reference={selected.referenceNumber} />
            </div>
            <div data-column="details" className="min-w-0">
              <h2 className="border-t-2 border-navy pt-3 font-display text-heading font-semibold text-navy">{SACRAMENT_LABEL[selected.sacrament]}</h2>
              <StatusPill status={selected.status} className="mt-2 inline-block" />
              <p className="mt-3 text-foreground">{scheduleText(selected)}</p>
              <p className="mt-1 text-sm text-muted-foreground">{PAYMENT_LABEL[selected.paymentStatus ?? 'not_required']}</p>
              {action && <p className="mt-3 text-sm font-medium text-status-pending-fg">{action}</p>}
              {lapsed && <p className="mt-3 text-sm text-muted-foreground">{HOLD_EXPIRED_NOTE}</p>}
              {full.data && (
                <div className="mt-5 flex flex-col gap-4">
                  <DayPassCard booking={full.data} parishName={parish?.name} />
                  <PreparationCard
                    booking={full.data}
                    collapsible
                    onUpdated={(updated) => {
                      queryClient.setQueryData(['booking', selected.id], updated)
                      queryClient.invalidateQueries({ queryKey: ['bookings', userId] })
                    }}
                  />
                </div>
              )}
              {full.isLoading && <p className="mt-5 text-sm text-muted-foreground">Loading…</p>}
              {full.isError && <p className="mt-5 text-sm text-danger">Couldn&apos;t load the day pass and checklist.</p>}
              <Link to={`/booking/history/${selected.id}`} className="mt-5 inline-block rounded-full bg-primary px-5 py-2 font-semibold text-primary-foreground">View full booking</Link>
            </div>
          </section>
        </div>
      )}
    </WebFrame>
  )
}
