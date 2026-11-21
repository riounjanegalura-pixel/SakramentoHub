import { useState } from 'react'
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { AdminLayout } from '../../components/shared/AdminLayout'
import { Disclosure } from '../../components/shared/Disclosure'
import { LoadError } from '../../components/shared/LoadError'
import { Reveal } from '../../components/shared/Reveal'
import { Skeleton } from '../../components/shared/Skeleton'
import { StatusBadge } from '../../components/shared/StatusBadge'
import { ApiError } from '../../lib/api/client'
import { fetchBooking } from '../../lib/data/bookings'
import { SACRAMENT_LABEL } from '../../lib/constants'
import { formatManilaDateTime24 } from '../../lib/domain'
import { useIsPhone } from '../../lib/hooks/useIsPhone'
import type { AdminBooking, Paginated } from '../../lib/types'
import { cn } from '../../lib/utils'
import { DecisionCard, PhoneActionBar, useDecision } from './BookingActions'
import { DetailsCard, ProgressDisclosure, WalkInEditLink, WhoAndWhen } from './DetailSections'
import { DocumentsCard } from './DocumentsCard'
import { NotesHistoryCard } from './NotesHistoryCard'
import { PaymentDialog } from './PaymentDialog'
import { PaymentPanel } from './PaymentPanel'
import { PreparationCard } from './PreparationCard'
import { RegisterEntryCard } from './RegisterEntryCard'
import { invalidateBookingCaches } from './invalidateBookingCaches'
import { CARD, FOCUS, OUTLINE_BTN } from './parts'

/** The bookings on either side of this one in the last queue the clerk looked at, read from the query cache. */
function neighbours(queryClient: QueryClient, id: string | undefined): { prev?: string; next?: string } {
  if (!id) return {}
  for (const [, data] of queryClient.getQueriesData<Paginated<AdminBooking>>({ queryKey: ['admin-bookings'] })) {
    const list = data?.data
    if (!Array.isArray(list)) continue
    const i = list.findIndex((b) => b.id === id)
    if (i >= 0) return { prev: list[i - 1]?.id, next: list[i + 1]?.id }
  }
  return {}
}

/** The loading shape is the final layout: the decision card, then the documents and the record. */
function LoadingShape({ phone }: { phone: boolean }) {
  const block = 'rounded-2xl bg-paper-deep'
  return (
    <div role="status" aria-busy="true" aria-label="Loading the booking" className="flex flex-col gap-5">
      <Skeleton className={cn(block, 'h-[180px]')} />
      <div className="flex flex-wrap gap-5">
        <div className="flex min-w-0 flex-[3_1_520px] flex-col gap-5">
          <Skeleton className={cn(block, 'h-[340px]')} />
          {!phone && <Skeleton className={cn(block, 'h-24')} />}
        </div>
        <div className="flex min-w-0 flex-[2_1_340px] flex-col gap-5">
          <Skeleton className={cn(block, 'h-[200px]')} />
          <Skeleton className={cn(block, 'h-[260px]')} />
        </div>
      </div>
    </div>
  )
}

const NAV_BTN = cn(OUTLINE_BTN, 'inline-flex h-10 min-h-11 items-center rounded-[10px] px-3.5 text-[14px] lg:min-h-10', FOCUS)

/**
 * One booking: the decision first, with the checklist that says what is
 * left; then the documents, who and when, progress, payment, and notes and history. On a phone the actions sit in a
 * bar above the bottom navigation and the long forms fold into rows.
 */
export function BookingDetailScreen() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const phone = useIsPhone()
  const [paying, setPaying] = useState(false)

  const { data: booking, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin-booking', id],
    queryFn: () => fetchBooking(id!),
    enabled: !!id,
  })
  const notFound = isError && error instanceof ApiError && error.status === 404

  function handleChanged(updated: AdminBooking) {
    queryClient.setQueryData(['admin-booking', id], updated)
    invalidateBookingCaches(queryClient, id)
  }

  return (
    <AdminLayout title={booking ? booking.subjectName : 'Booking'}>
      <div className={cn('flex w-full max-w-[1760px] flex-col gap-5', phone && booking && 'pb-36')}>
        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={() => navigate('/bookings')} className={`-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-[14px] font-semibold text-navy ${phone ? 'text-[15px]' : ''} ${FOCUS}`}>
            <ArrowLeft size={18} aria-hidden="true" /> Bookings
          </button>
          {booking && !phone && <Neighbours queryClient={queryClient} id={booking.id} />}
        </div>

        {isLoading && <LoadingShape phone={phone} />}

        {notFound && (
          <section className={cn(CARD, 'max-w-[560px] p-8')}>
            <h2 className="mb-2 font-display text-[22px] font-semibold text-navy">Booking not found</h2>
            <p className="text-[15px] text-ink-muted">It may have been removed, or the link is wrong. Go back to the bookings list to find it.</p>
          </section>
        )}
        {isError && !notFound && (
          <LoadError title="This booking didn't load" message="The parish system did not answer. Check your connection, then try again." detail={(error as Error).message} onRetry={() => void refetch()} />
        )}

        {booking && <BookingBody booking={booking} phone={phone} onChanged={handleChanged} onTakePayment={() => setPaying(true)} />}
        {booking && <PaymentDialog booking={booking} open={paying} onOpenChange={setPaying} onDone={(b) => { setPaying(false); handleChanged(b) }} />}
      </div>
    </AdminLayout>
  )
}

function Neighbours({ queryClient, id }: { queryClient: QueryClient; id: string }) {
  const { prev, next } = neighbours(queryClient, id)
  if (!prev && !next) return null
  return (
    <div className="flex gap-2">
      {prev && <Link to={`/bookings/${prev}`} className={NAV_BTN}>Previous</Link>}
      {next && <Link to={`/bookings/${next}`} className={NAV_BTN}>Next booking</Link>}
    </div>
  )
}

function BookingBody({
  booking: b,
  phone,
  onChanged,
  onTakePayment,
}: {
  booking: AdminBooking
  phone: boolean
  onChanged: (b: AdminBooking) => void
  onTakePayment: () => void
}) {
  const decision = useDecision(b, onChanged)
  const lead = b.channel === 'walk_in' && b.status === 'returned' ? <WalkInEditLink id={b.id} /> : undefined

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <p className="m-0 flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] text-ink-muted">
          <span>{SACRAMENT_LABEL[b.sacrament]}</span>
          {b.channel === 'walk_in' && <span className="rounded-full bg-paper-deep px-2.5 py-0.5 text-[13px] font-medium text-ink">Walk-in</span>}
          <span className="font-mono text-[15px] text-ink" translate="no">{b.referenceNumber}</span>
          <span>Submitted {formatManilaDateTime24(b.createdAt)}</span>
        </p>
        <StatusBadge status={b.status} className="h-8 px-3.5 text-[14px] font-semibold" />
      </header>

      <Reveal>
        <DecisionCard booking={b} decision={decision} onTakePayment={onTakePayment} lead={lead} phone={phone} />
      </Reveal>

      <Reveal>
      {phone ? (
        <div className="flex flex-col gap-4">
          <DocumentsCard booking={b} onChanged={onChanged} />
          <PreparationCard booking={b} onChanged={onChanged} />
          <WhoAndWhen booking={b} phone />
          <ProgressDisclosure booking={b} />
          <PaymentPanel booking={b} onChanged={onChanged} onTakePayment={onTakePayment} />
          {b.registerEntry && <RegisterEntryCard bookingId={b.id} entry={b.registerEntry} />}
          <Disclosure title="Notes and history" summary="What staff wrote and what changed">
            <NotesHistoryCard bookingId={b.id} className="border-0 p-0" />
          </Disclosure>
          <DetailsCard booking={b} />
        </div>
      ) : (
        <div className="flex flex-wrap items-start gap-5">
          <div className="flex min-w-0 flex-[3_1_520px] flex-col gap-5">
            <DocumentsCard booking={b} onChanged={onChanged} />
            <PreparationCard booking={b} onChanged={onChanged} />
            <DetailsCard booking={b} />
          </div>
          <div className="flex min-w-0 flex-[2_1_340px] flex-col gap-5">
            <WhoAndWhen booking={b} />
            <ProgressDisclosure booking={b} />
            <PaymentPanel booking={b} onChanged={onChanged} onTakePayment={onTakePayment} />
            {b.registerEntry && <RegisterEntryCard bookingId={b.id} entry={b.registerEntry} />}
            <Disclosure title="Notes and history" summary="What staff wrote and what changed">
              <NotesHistoryCard bookingId={b.id} className="border-0 p-0" />
            </Disclosure>
          </div>
        </div>
      )}
      </Reveal>
      {/* Outside every Reveal: a transformed ancestor would offset a position: fixed bar. */}
      {phone && <PhoneActionBar decision={decision} />}
      {decision.dialogs}
    </>
  )
}
