import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppointmentDatePicker } from './AppointmentDatePicker'

const fetchAvailabilityDays = vi.fn()
vi.mock('../../lib/data/availability', () => ({ fetchAvailabilityDays: (...a: unknown[]) => fetchAvailabilityDays(...a) }))

/** Set to pin the parish (Manila) date in one test; null = the real parishToday(). */
let fakeParishToday: string | null = null
vi.mock('../../lib/domain', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/domain')>()
  return { ...actual, parishToday: () => fakeParishToday ?? actual.parishToday() }
})

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function renderPicker(onChange = vi.fn(), value?: string, excludeBookingId?: string) {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <span id="lbl">Date</span>
      <AppointmentDatePicker sacrament="funeral" value={value} onChange={onChange} labelId="lbl" context={{ massType: 'house' }} excludeBookingId={excludeBookingId} />
    </QueryClientProvider>,
  )
  return onChange
}

describe('AppointmentDatePicker', () => {
  beforeEach(() => {
    fetchAvailabilityDays.mockReset()
    fakeParishToday = null
  })

  it('requests the visible month once with the schedule context', async () => {
    fetchAvailabilityDays.mockResolvedValue([])
    renderPicker()
    await waitFor(() => expect(fetchAvailabilityDays).toHaveBeenCalledTimes(1))
    expect(fetchAvailabilityDays.mock.calls[0][3]).toEqual({ massType: 'house' })
  })

  it("passes the booking being edited so its own slot is not shown as taken", async () => {
    fetchAvailabilityDays.mockResolvedValue([])
    renderPicker(vi.fn(), undefined, 'r1')
    await waitFor(() => expect(fetchAvailabilityDays).toHaveBeenCalledTimes(1))
    expect(fetchAvailabilityDays.mock.calls[0][4]).toBe('r1')
  })

  it('disables full and unavailable days and announces the reason', async () => {
    const t = new Date()
    const a = new Date(t.getFullYear(), t.getMonth(), Math.min(t.getDate() + 1, 28))
    fetchAvailabilityDays.mockResolvedValue([
      { date: ymd(a), status: 'unavailable', reason: 'Unavailable: Good Friday.', freeCount: 0 },
    ])
    renderPicker()
    const btn = await screen.findByRole('button', { name: /good friday/i })
    expect(btn).toBeDisabled()
  })

  it('emits the picked date as YYYY-MM-DD', async () => {
    fetchAvailabilityDays.mockResolvedValue([])
    const onChange = renderPicker()
    const days = (await screen.findAllByRole('button', { name: /\d{4}/ })).filter((b) => !b.hasAttribute('disabled'))
    await userEvent.click(days[days.length - 1])
    expect(onChange).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/))
  })

  it("marks the parish's today (Manila), not the device's, as today", async () => {
    const t = new Date()
    const parishDay = new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1)
    fakeParishToday = ymd(parishDay)
    fetchAvailabilityDays.mockResolvedValue([])
    renderPicker()

    const todayButtons = await screen.findAllByRole('button', { name: /, today/ })
    expect(todayButtons).toHaveLength(1)
    expect(todayButtons[0]).toHaveAccessibleName(expect.stringContaining(parishDay.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })))
  })
})
