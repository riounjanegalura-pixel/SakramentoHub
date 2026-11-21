import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { AppShell } from '../../../components/shared/AppShell'
import { Button } from '../../../components/ui/button'
import { ResultMark } from '../../../components/shared/ResultMark'
import { useBookingStore } from '../../../stores/booking-store'
import { fetchBooking } from '../../../lib/data/bookings'
import { formatDate, formatTime } from '../../../lib/domain'

export function SubmittedScreen() {
  const navigate = useNavigate()
  // Captured once: the unmount cleanup below clears the store, and StrictMode's
  // simulated remount runs it immediately — local state survives that.
  const [bookingId] = useState(() => useBookingStore.getState().bookingId)
  const reset = useBookingStore((s) => s.reset)
  const { data: booking } = useQuery({ queryKey: ['booking', bookingId], queryFn: () => fetchBooking(bookingId!), enabled: !!bookingId })

  useEffect(() => () => reset(), [reset])

  return (
    <AppShell showBottomNav={false} webFrame webWidth="max-w-2xl">
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <ResultMark tone="done" icon={Check} />
        <h2 className="font-display text-display-xl font-semibold text-navy">Booking submitted</h2>
        {booking && (
          <p className="numeric text-body text-ink">
            Reference <strong>{booking.referenceNumber}</strong>
            {booking.appointmentDate && booking.appointmentStart && (
              <>
                <br />
                {formatDate(booking.appointmentDate)} · {formatTime(booking.appointmentStart)}
              </>
            )}
          </p>
        )}
        <p className="text-ink-muted">
          The parish office will review it. You'll get a notification here when it's approved or if anything needs changing.
        </p>
        {booking && booking.paymentStatus === 'unpaid' && booking.canPayNow === false && (
          <p className="text-ink-muted">There is a fee. Once the booking is approved, you can pay by GCash or in cash at the parish office.</p>
        )}
        <div className="mt-4 flex w-full flex-col gap-3">
          <Button type="button" size="lg" className="w-full" onClick={() => navigate('/booking/history')}>
            View my bookings
          </Button>
          <Button type="button" variant="outline" className="w-full" onClick={() => navigate('/home')}>
            Back to Home
          </Button>
        </div>
      </div>
    </AppShell>
  )
}
