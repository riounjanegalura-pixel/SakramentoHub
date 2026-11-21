import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchAvailabilityDays, fetchDayAvailability } from './availability'

const apiFetch = vi.fn()
vi.mock('./client', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }))

describe('availability api', () => {
  beforeEach(() => {
    apiFetch.mockReset()
    apiFetch.mockResolvedValue({ days: [] })
  })

  it('asks for a day and a range without excludeBookingId by default', async () => {
    await fetchDayAvailability('funeral', '2026-11-03', { massType: 'house' })
    await fetchAvailabilityDays('funeral', '2026-11-01', '2026-11-30')

    expect(apiFetch).toHaveBeenNthCalledWith(1, '/services/funeral/availability?date=2026-11-03&massType=house')
    expect(apiFetch).toHaveBeenNthCalledWith(2, '/services/funeral/availability-range?start=2026-11-01&end=2026-11-30')
  })

  it("passes the caller's own booking so it does not block its own slot", async () => {
    await fetchDayAvailability('confirmation', '2026-11-17', {}, 'b 1')
    await fetchAvailabilityDays('confirmation', '2026-11-01', '2026-11-30', { scheduleType: 'special' }, 'b 1')

    expect(apiFetch).toHaveBeenNthCalledWith(1, '/services/confirmation/availability?date=2026-11-17&excludeBookingId=b+1')
    expect(apiFetch).toHaveBeenNthCalledWith(
      2,
      '/services/confirmation/availability-range?start=2026-11-01&end=2026-11-30&scheduleType=special&excludeBookingId=b+1',
    )
  })
  it('asks the server to ignore lead time only when the desk waives it', async () => {
    await fetchDayAvailability('house-blessing', '2026-11-03', { waiveLeadTime: true }, 'b1')
    await fetchAvailabilityDays('house-blessing', '2026-11-01', '2026-11-30', { waiveLeadTime: false })

    expect(apiFetch).toHaveBeenNthCalledWith(1, '/services/house-blessing/availability?date=2026-11-03&waiveLeadTime=1&excludeBookingId=b1')
    expect(apiFetch).toHaveBeenNthCalledWith(2, '/services/house-blessing/availability-range?start=2026-11-01&end=2026-11-30')
  })
})
