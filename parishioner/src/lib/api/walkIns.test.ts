import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ApiError } from './client'
import { createPaymentLink, createWalkIn, fetchDeskBooking, lookupParishioner, submitWalkIn, updateWalkIn } from './walkIns'

const apiFetch = vi.fn()
vi.mock('./client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./client')>()),
  apiFetch: (...a: unknown[]) => apiFetch(...a),
}))

const body = {
  contact: { fullName: 'Lola Nena Cruz', phone: '09171234567', email: null, relationship: 'relative' },
  linkUserId: null,
  formData: { propertyOwner: 'Nena' },
  appointmentDate: '2026-11-10',
  appointmentStart: '10:00',
}
const sent = (n = 0) => JSON.parse((apiFetch.mock.calls[n][1] as RequestInit).body as string)

describe('walk-in api', () => {
  beforeEach(() => {
    apiFetch.mockReset()
    apiFetch.mockResolvedValue({ id: 'w1' })
  })

  it('creates a walk-in draft', async () => {
    await createWalkIn('house-blessing', body)
    expect(apiFetch.mock.calls[0][0]).toBe('/admin/walk-ins')
    expect((apiFetch.mock.calls[0][1] as RequestInit).method).toBe('POST')
    expect(sent()).toEqual({ sacrament: 'house-blessing', ...body })
  })

  it('updates a walk-in', async () => {
    await updateWalkIn('w1', body)
    expect(apiFetch.mock.calls[0][0]).toBe('/admin/walk-ins/w1')
    expect((apiFetch.mock.calls[0][1] as RequestInit).method).toBe('PATCH')
    expect(sent()).toEqual(body)
  })

  it('submits with an empty body unless the lead time is waived, and trims the reason', async () => {
    await submitWalkIn('w1', { waiveLeadTime: false, waiveReason: 'ignored' })
    await submitWalkIn('w1', { waiveLeadTime: true, waiveReason: '  Moving in tomorrow ' })
    expect(apiFetch.mock.calls[0][0]).toBe('/admin/walk-ins/w1/submit')
    expect(sent(0)).toEqual({})
    expect(sent(1)).toEqual({ waiveLeadTime: true, waiveReason: 'Moving in tomorrow' })
  })

  it('looks up a parishioner account by email', async () => {
    apiFetch.mockResolvedValue({ id: 'u1', fullName: 'Maria Santos' })
    expect(await lookupParishioner('maria+1@example.com')).toEqual({ id: 'u1', fullName: 'Maria Santos' })
    expect(apiFetch.mock.calls[0][0]).toBe('/admin/parishioners/lookup?email=maria%2B1%40example.com')
  })

  it('treats a 404 lookup as "no account" and rethrows anything else', async () => {
    apiFetch.mockRejectedValueOnce(new ApiError('No parishioner account uses that email.', 404))
    expect(await lookupParishioner('nobody@example.com')).toBeNull()
    apiFetch.mockRejectedValueOnce(new ApiError('Server error', 500))
    await expect(lookupParishioner('x@example.com')).rejects.toThrow('Server error')
  })

  it('reads a booking and opens the staff payment link', async () => {
    await fetchDeskBooking('w1')
    expect(apiFetch.mock.calls[0][0]).toBe('/admin/bookings/w1')
    apiFetch.mockResolvedValueOnce({ checkoutUrl: 'https://pay.test/cs_1', checkoutSessionId: 'cs_1' })
    expect(await createPaymentLink('w1')).toEqual({ checkoutUrl: 'https://pay.test/cs_1', checkoutSessionId: 'cs_1' })
    expect(apiFetch.mock.calls[1][0]).toBe('/admin/bookings/w1/payment')
    expect((apiFetch.mock.calls[1][1] as RequestInit).method).toBe('POST')
  })

  it('reports an already-paid booking (409) as null, and rethrows other refusals', async () => {
    apiFetch.mockRejectedValueOnce(new ApiError('This booking has already been paid.', 409))
    expect(await createPaymentLink('w1')).toBeNull()
    apiFetch.mockRejectedValueOnce(new ApiError('GCash payments are not available right now. Please try again later.', 503))
    await expect(createPaymentLink('w1')).rejects.toThrow(/not available right now/)
  })
})
