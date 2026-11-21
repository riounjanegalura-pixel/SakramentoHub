import { useQuery } from '@tanstack/react-query'
import { fetchBooking } from '../../../lib/data/bookings'
import { fetchDeskBooking } from '../../../lib/data/walkIns'
import { useBookingStore } from '../../../stores/booking-store'
import type { Booking } from '../../../lib/types'
import { useWizard } from './WizardContext'

/** The server's copy of the returned booking being edited (its document reviews live there); undefined for a new draft. The desk reads the staff copy. */
export function useEditingBooking(): Booking | undefined {
  const { mode } = useWizard()
  const desk = mode === 'desk'
  const id = useBookingStore((s) => s.editingBookingId)
  const { data } = useQuery({
    queryKey: [desk ? 'desk-booking' : 'booking', id],
    queryFn: () => (desk ? fetchDeskBooking(id!) : fetchBooking(id!)),
    enabled: !!id,
  })
  return data
}
