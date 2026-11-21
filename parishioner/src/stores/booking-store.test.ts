import { describe, it, expect, beforeEach } from 'vitest'
import { useBookingStore } from './booking-store'

describe('useBookingStore', () => {
  beforeEach(() => {
    useBookingStore.getState().reset()
  })

  it('starts a booking with empty form data', () => {
    useBookingStore.getState().startBooking('baptism')
    const state = useBookingStore.getState()
    expect(state.sacrament).toBe('baptism')
    expect(state.formData).toEqual({})
  })

  it('merges form data across updateFormData calls', () => {
    useBookingStore.getState().startBooking('baptism')
    useBookingStore.getState().updateFormData({ fullName: 'Rio' })
    useBookingStore.getState().updateFormData({ email: 'rio@x.com' })
    expect(useBookingStore.getState().formData).toEqual({ fullName: 'Rio', email: 'rio@x.com' })
  })

  it('reset clears everything, including bookingId and the appointment', () => {
    useBookingStore.getState().startBooking('baptism')
    useBookingStore.getState().updateFormData({ fullName: 'Rio' })
    useBookingStore.getState().setBookingId('booking-123')
    useBookingStore.getState().setAppointment('2026-12-01', '09:00')
    useBookingStore.getState().setEditingBookingId('booking-9')
    useBookingStore.getState().reset()
    const state = useBookingStore.getState()
    expect(state.sacrament).toBeNull()
    expect(state.formData).toEqual({})
    expect(state.bookingId).toBeNull()
    expect(state.appointmentDate).toBeNull()
    expect(state.appointmentStart).toBeNull()
    expect(state.editingBookingId).toBeNull()
  })

  it('startBooking resets stale state from a prior booking, including bookingId', () => {
    useBookingStore.getState().startBooking('baptism')
    useBookingStore.getState().updateFormData({ fullName: 'Rio' })
    useBookingStore.getState().setBookingId('booking-123')

    useBookingStore.getState().startBooking('wedding')
    const state = useBookingStore.getState()
    expect(state.sacrament).toBe('wedding')
    expect(state.formData).toEqual({})
    expect(state.bookingId).toBeNull()
  })

  it('setBookingId captures the id of the saved draft', () => {
    useBookingStore.getState().startBooking('baptism')
    expect(useBookingStore.getState().bookingId).toBeNull()
    useBookingStore.getState().setBookingId('booking-abc-123')
    expect(useBookingStore.getState().bookingId).toBe('booking-abc-123')
  })

  it('no longer holds a step or a payment method', () => {
    useBookingStore.getState().startBooking('funeral')
    const state = useBookingStore.getState() as unknown as Record<string, unknown>
    expect(state).not.toHaveProperty('step')
    expect(state).not.toHaveProperty('paymentMethod')
  })

  it('migrates a v3 draft: drops step and paymentMethod, keeps every other key', async () => {
    sessionStorage.setItem(
      'sakramentohub_booking_draft',
      JSON.stringify({
        version: 3,
        state: {
          sacrament: 'baptism', step: 4, formData: { a: 1 }, paymentMethod: 'gcash', bookingId: 'b1',
          appointmentDate: '2026-12-01', appointmentStart: '09:00', editingBookingId: 'b0',
        },
      }),
    )
    await useBookingStore.persist.rehydrate()
    const state = useBookingStore.getState() as unknown as Record<string, unknown>
    expect(state).toMatchObject({
      sacrament: 'baptism', formData: { a: 1 }, bookingId: 'b1',
      appointmentDate: '2026-12-01', appointmentStart: '09:00', editingBookingId: 'b0',
    })
    expect(state).not.toHaveProperty('step')
    expect(state).not.toHaveProperty('paymentMethod')
  })
})
