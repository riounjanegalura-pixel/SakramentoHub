import { useQuery } from '@tanstack/react-query'
import { Navigate, useParams } from 'react-router-dom'
import { AdminLayout } from '../../components/shared/AdminLayout'
import { LoadError } from '../../components/shared/LoadError'
import { Skeleton } from '../../components/shared/Skeleton'
import { fetchBookingByReference } from '../../lib/data/bookings'

/**
 * Where a day-pass QR code lands. There is no separate check-in screen: arrival is marked on the booking itself, so
 * this only looks the reference up and sends the office to that booking.
 */
export function OpenByReference() {
  const { reference } = useParams<{ reference: string }>()
  const { data, isError, error, refetch } = useQuery({
    queryKey: ['admin-booking-by-reference', reference],
    queryFn: () => fetchBookingByReference(reference!),
    enabled: !!reference,
    retry: false,
  })

  if (data) return <Navigate to={`/bookings/${data.id}`} replace />

  return (
    <AdminLayout title="Booking">
      {isError ? (
        <LoadError message={`Couldn't find that booking: ${(error as Error).message}`} onRetry={() => void refetch()} />
      ) : (
        <div role="status" aria-busy="true" className="flex flex-col gap-3">
          <p className="sr-only">Finding the booking</p>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}
    </AdminLayout>
  )
}
