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
    localStorage.clear() // the older version kept it in sessionStorage
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

  describe('a half-filled booking survives a reload', () => {
    const KEY = 'sakramentohub_booking_draft'
    const DAY = 86_400_000
    const saved = (over: Record<string, unknown> = {}, savedAt = Date.now()) =>
      JSON.stringify({ version: 5, state: { sacrament: 'baptism', formData: { childFirstName: 'Rio' }, bookingId: null, appointmentDate: null, appointmentStart: null, editingBookingId: null, ownerId: 'u1', savedAt, ...over } })

    beforeEach(() => {
      localStorage.clear()
      sessionStorage.clear()
    })

    it('is kept in localStorage, which a phone app being closed and reopened does not clear', () => {
      useBookingStore.getState().startBooking('baptism')
      useBookingStore.getState().updateFormData({ childFirstName: 'Rio' })

      const stored = JSON.parse(localStorage.getItem(KEY) ?? 'null')
      expect(stored.state.formData).toEqual({ childFirstName: 'Rio' })
      expect(typeof stored.state.savedAt).toBe('number')
      expect(sessionStorage.getItem(KEY)).toBeNull()
    })

    it('comes back after a reload within a week', async () => {
      localStorage.setItem(KEY, saved({}, Date.now() - 6 * DAY))
      await useBookingStore.persist.rehydrate()

      expect(useBookingStore.getState().formData).toEqual({ childFirstName: 'Rio' })
      expect(useBookingStore.getState().sacrament).toBe('baptism')
    })

    it('is dropped once it is more than a week old', async () => {
      localStorage.setItem(KEY, saved({}, Date.now() - 8 * DAY))
      await useBookingStore.persist.rehydrate()

      expect(useBookingStore.getState().formData).toEqual({})
      expect(useBookingStore.getState().sacrament).toBeNull()
      expect(localStorage.getItem(KEY)).toBeNull()
    })

    it('an answer typed later keeps the draft alive for another week', async () => {
      localStorage.setItem(KEY, saved({}, Date.now() - 6 * DAY))
      await useBookingStore.persist.rehydrate()
      useBookingStore.getState().updateFormData({ childLastName: 'Cruz' })

      expect(JSON.parse(localStorage.getItem(KEY) ?? 'null').state.savedAt).toBeGreaterThan(Date.now() - 1000)
    })

    it('moves a draft left in the old session storage over, once', async () => {
      sessionStorage.setItem(KEY, saved({ ownerId: null }))
      await useBookingStore.persist.rehydrate()

      expect(useBookingStore.getState().formData).toEqual({ childFirstName: 'Rio' })
      expect(sessionStorage.getItem(KEY)).toBeNull()
      expect(localStorage.getItem(KEY)).not.toBeNull()
    })

    it('stays with the person who started it: the same person keeps it, another person does not see it', async () => {
      localStorage.setItem(KEY, saved())
      await useBookingStore.persist.rehydrate()

      useBookingStore.getState().adoptOwner('u1')
      expect(useBookingStore.getState().formData).toEqual({ childFirstName: 'Rio' })

      useBookingStore.getState().adoptOwner('u2')
      expect(useBookingStore.getState().formData).toEqual({})
      expect(useBookingStore.getState().sacrament).toBeNull()
      expect(useBookingStore.getState().ownerId).toBe('u2')
    })

    it('a draft with no owner yet is claimed by whoever signs in', async () => {
      localStorage.setItem(KEY, saved({ ownerId: null }))
      await useBookingStore.persist.rehydrate()

      useBookingStore.getState().adoptOwner('u7')

      expect(useBookingStore.getState().formData).toEqual({ childFirstName: 'Rio' })
      expect(useBookingStore.getState().ownerId).toBe('u7')
    })

    it('a corrupted entry is ignored instead of breaking the app', async () => {
      localStorage.setItem(KEY, '{not json')
      await expect(useBookingStore.persist.rehydrate()).resolves.not.toThrow()

      expect(useBookingStore.getState().formData).toEqual({})
    })
  })
})
