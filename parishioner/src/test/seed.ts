import { readBookings, writeBookings } from '../lib/mock/booking-storage'
import { STATUS_LABEL } from '../lib/domain'
import type { Booking } from '../lib/types'

/** Writes a booking straight into mock storage, for tests that need a booking in a given state. */
export function seedBooking(overrides: Partial<Booking> = {}): Booking {
  const status = overrides.status ?? 'draft'
  const booking: Booking = {
    id: crypto.randomUUID(),
    referenceNumber: 'TEST-00000000-AAAA',
    userId: 'user-1',
    sacrament: 'wedding',
    status,
    statusLabel: STATUS_LABEL[status],
    formData: {},
    appointmentDate: null,
    appointmentStart: null,
    appointmentEnd: null,
    isEmergency: false,
    paymentStatus: null,
    amountDueCentavos: 0,
    paymentHoldExpiresAt: null,
    paidAt: null,
    paymentReference: null,
    refundReference: null,
    refundedAt: null,
    statusReason: null,
    returnNote: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  }
  writeBookings([...readBookings(), booking])
  return booking
}
