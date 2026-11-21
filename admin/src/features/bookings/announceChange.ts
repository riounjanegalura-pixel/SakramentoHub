import { toast } from 'sonner'
import type { AdminBooking } from '../../lib/types'

const BY_STATUS: Partial<Record<AdminBooking['status'], string>> = {
  approved: 'Booking approved',
  declined: 'Booking declined',
  cancelled: 'Booking cancelled',
  completed: 'Booking marked completed',
  returned: 'Sent back to the parishioner',
}

/** Tells the person at the desk what a decision just did: the one confirmation a quiet screen update never gave. */
export function announceBookingChange(prev: AdminBooking, next: AdminBooking): void {
  if (next.status !== prev.status && BY_STATUS[next.status]) return void toast.success(BY_STATUS[next.status]!)
  if (next.checkedInAt && !prev.checkedInAt) return void toast.success('Checked in')
  if (next.appointmentDate !== prev.appointmentDate || next.appointmentStart !== prev.appointmentStart) return void toast.success('Booking rescheduled')
  if (next.paymentStatus === 'refunded' && prev.paymentStatus !== 'refunded') return void toast.success('Refund recorded')
}
