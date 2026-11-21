import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom'
import { DashboardScreen } from './DashboardScreen'
import * as analyticsData from '../../lib/data/analytics'
import * as notificationsData from '../../lib/data/notifications'
import * as scheduleData from '../../lib/data/schedule'
import type { AdminAnalytics, Schedule, ScheduleBookingItem, ScheduleDay } from '../../lib/types'
import { expectNoA11yViolations } from '../../test/a11y'
import { adminAnalytics } from '../../test/factories'
import { LocationProbe, renderWithProviders } from '../../test/render'

// 9:15 AM in Manila on Tuesday, November 3, 2026, so the 10:00 visit is in 45 minutes.
const NOW = new Date('2026-11-03T01:15:00Z')

const booking = (o: Partial<ScheduleBookingItem> = {}): ScheduleBookingItem => ({
  type: 'booking', id: 'b1', referenceNumber: 'BAP-1', sacrament: 'baptism', subjectName: 'Mateo Cruz',
  start: '08:00', end: '09:00', status: 'completed', paymentStatus: 'paid', isOffsite: false, channel: 'online', inSession: false,
  checkedInAt: '2026-11-02T23:52:00Z', contactName: 'Ana Cruz', contactRelationship: null, contactPhone: '09175550121', location: null, ...o,
})

function november(): Schedule {
  const days: ScheduleDay[] = Array.from({ length: 30 }, (_, i) => ({ date: `2026-11-${String(i + 1).padStart(2, '0')}`, blackouts: [], items: [] }))
  days[2].items = [
    booking(),
    booking({
      id: 'b2', referenceNumber: 'FUN-2', sacrament: 'funeral', subjectName: 'Lorenzo Pascual', start: '10:00', end: '11:30', status: 'approved',
      checkedInAt: null, isOffsite: true, contactName: 'Maria Pascual', contactPhone: '09175550188', location: 'San Juan, Balagtas, Bulacan',
    }),
    booking({ id: 'b3', referenceNumber: 'HBL-3', sacrament: 'house-blessing', subjectName: 'Santos family', start: '15:00', end: '16:00', status: 'approved', checkedInAt: null, channel: 'walk_in', paymentStatus: 'unpaid' }),
  ]
  days[1].blackouts = [{ reason: "All Souls' Day", appliesTo: 'All services' }]
  days[4].items = [booking({ id: 'b4', subjectName: 'Jun Reyes', sacrament: 'confirmation', start: '14:00', end: '15:00', status: 'returned', checkedInAt: null })]
  return {
    travelBufferMinutes: 30,
    days,
    unscheduled: [{ id: 'u1', referenceNumber: 'ANO-1', subjectName: 'Rosario Dela Cruz', contactPhone: '0917 555 0142', status: 'submitted', createdAt: '2026-11-02T01:00:00Z' }],
  }
}

const busy: AdminAnalytics = adminAnalytics({
  attention: { awaitingReview: 7, urgentOpen: 1, refundDue: 2, overpaid: 0, todayAppointments: 3, holdsExpiringSoon: 1, certificateRequests: 3 },
  visitsAhead: Array.from({ length: 14 }, (_, i) => ({ date: `2026-11-${String(4 + i).padStart(2, '0')}`, count: [0, 2, 1, 0, 0, 0, 2, 0, 1, 0, 0, 0, 0, 0][i] })),
  bookingsPerDay: [2, 3, 1, 0, 4, 2, 3, 1, 2, 5, 3, 2, 4, 6].map((count, i) => ({ date: new Date(Date.UTC(2026, 9, 21 + i)).toISOString().slice(0, 10), count })),
  waitingPreview: [
    { kind: 'hold', bookingId: 'h1', subjectName: 'Santos family', sacrament: 'house-blessing', holdExpiresAt: '2026-11-03T03:15:00Z' },
    { kind: 'review', bookingId: 'r1', subjectName: 'Carla Mendoza', sacrament: 'wedding', submittedAt: '2026-11-01T01:00:00Z' },
    { kind: 'refund', bookingId: 'f1', subjectName: 'Lorenzo Pascual', sacrament: 'funeral', refundCentavos: 50000 },
  ],
  dueSoon: [
    { bookingId: 'd1', subjectName: 'Mateo Cruz', service: 'Baptism', date: '2026-11-03', start: '08:00', paymentStatus: 'paid' },
    { bookingId: 'd2', subjectName: 'Ana Reyes', service: 'Wedding', date: '2026-11-04', start: '14:30', paymentStatus: 'not_required' },
    { bookingId: 'd3', subjectName: 'Lorenzo Pascual', service: 'Funeral Mass', date: '2026-11-05', start: null, paymentStatus: null },
  ],
})

const quiet: AdminAnalytics = adminAnalytics({
  attention: { awaitingReview: 0, urgentOpen: 0, refundDue: 0, overpaid: 0, todayAppointments: 0, holdsExpiringSoon: 0, certificateRequests: 0 },
  visitsAhead: Array.from({ length: 14 }, (_, i) => ({ date: `2026-11-${String(4 + i).padStart(2, '0')}`, count: 0 })),
  bookingsPerDay: Array.from({ length: 14 }, (_, i) => ({ date: `2026-10-${String(21 + i).padStart(2, '0')}`, count: 0 })),
})

function setup(analytics: AdminAnalytics | 'pending' | Error = busy, schedule: Schedule = november(), route = '/dashboard') {
  const fetchAnalytics = vi.spyOn(analyticsData, 'fetchAnalytics')
  if (analytics === 'pending') fetchAnalytics.mockReturnValue(new Promise(() => {}))
  else if (analytics instanceof Error) fetchAnalytics.mockRejectedValueOnce(analytics)
  else fetchAnalytics.mockResolvedValue(analytics)
  vi.spyOn(scheduleData, 'fetchSchedule').mockResolvedValue(schedule)
  const view = renderWithProviders(<><DashboardScreen /><LocationProbe /></>, { route })
  return { ...view, fetchAnalytics }
}

function phone(on: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: on && query.includes('max-width'), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false,
  }))
}

describe('DashboardScreen', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    vi.spyOn(notificationsData, 'fetchNotifications').mockResolvedValue([])
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('shows a skeleton in the final shape while the data loads, busy and named', () => {
    setup('pending')
    const status = screen.getByRole('status', { name: /loading the dashboard/i })
    expect(status).toHaveAttribute('aria-busy', 'true')
  })

  it('says the dashboard did not load and retries when asked', async () => {
    const { fetchAnalytics } = setup(new Error('down'))
    expect(await screen.findByRole('alert')).toHaveTextContent("The dashboard didn't load.")
    fetchAnalytics.mockResolvedValue(busy)
    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('region', { name: 'Waiting for you' })).toBeInTheDocument()
    expect(fetchAnalytics).toHaveBeenCalledTimes(2)
  })

  it('leads with one sentence: what is next and which hold ends', async () => {
    setup()
    expect(await screen.findByText(/Lorenzo Pascual's funeral.* is next, in 45 minutes\. One payment hold ends in 2 hours\./)).toBeInTheDocument()
    expect(screen.getByText('Tuesday, November 3')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
  })

  it('says nothing is waiting when the parish is quiet, and shows the caught-up state', async () => {
    setup(quiet, { travelBufferMinutes: 30, days: [], unscheduled: [] })
    expect(await screen.findByText('Nothing is waiting and there are no visits today.')).toBeInTheDocument()
    expect(screen.getByText('You are all caught up')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Priority request' })).not.toBeInTheDocument()
    expect(screen.getByText('No visits.')).toBeInTheDocument()
    expect(screen.getByText('No new bookings in the last 14 days.')).toBeInTheDocument()
  })

  it('shows the urgent anointing with a Call link that rings the family', async () => {
    setup()
    const banner = await screen.findByRole('region', { name: 'Priority request' })
    expect(within(banner).getByText('Urgent')).toBeInTheDocument()
    expect(within(banner).getByRole('link', { name: /Rosario Dela Cruz needs an anointing/ })).toHaveAttribute('href', '/bookings/u1')
    expect(within(banner).getByRole('link', { name: 'Call 0917 555 0142' })).toHaveAttribute('href', 'tel:09175550142')
  })

  it("lists today's visits with their state, travel and a Call button on the next one only", async () => {
    setup()
    const day = await screen.findByRole('region', { name: 'The day' })
    expect(within(day).getByRole('heading', { name: 'Today' })).toBeInTheDocument()
    expect(await within(day).findByText('Arrived')).toBeInTheDocument()
    expect(within(day).getByText('Next · in 45 min')).toBeInTheDocument()
    expect(within(day).getByText(/off-site · leave by 9:30 AM/)).toBeInTheDocument()
    expect(within(day).getAllByRole('link', { name: /Call/ })).toHaveLength(1)
    expect(within(day).getByRole('link', { name: 'Call Maria Pascual' })).toHaveAttribute('href', 'tel:09175550188')
    expect(within(day).getByRole('link', { name: /Mateo Cruz/ })).toHaveAttribute('href', '/bookings/b1')
    expect(within(day).getByRole('img', { name: /Today: 8:00 AM Mateo Cruz/ })).toBeInTheDocument()
  })

  it('opens another day from the calendar and keeps it in the address', async () => {
    setup()
    await screen.findByRole('region', { name: 'The day' })
    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(await screen.findByRole('button', { name: /^November 5, 1 visit$/ }))
    expect(await screen.findByRole('heading', { name: 'Thursday, November 5' })).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('/dashboard?date=2026-11-05')
    expect(screen.getByText('Needs changes')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^November 5/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('opens the day named by an old Schedule link', async () => {
    setup(busy, november(), '/dashboard?date=2026-11-02')
    expect(await screen.findByRole('heading', { name: 'Monday, November 2' })).toBeInTheDocument()
    expect(await screen.findByRole('note')).toHaveTextContent("Closed: All Souls' Day")
    expect(screen.getByRole('button', { name: /^November 2, parish closed/ })).toBeInTheDocument()
  })

  it('shows what is waiting: the count, its parts, three items and the rest', async () => {
    setup()
    const waiting = await screen.findByRole('region', { name: 'Waiting for you' })
    expect(within(waiting).getByText('13')).toBeInTheDocument()
    for (const label of ['Review', 'Certificates', 'Refunds', 'Holds']) expect(within(waiting).getByRole('link', { name: new RegExp(String.raw`^${label}\s*\d+$`) })).toBeInTheDocument()
    expect(within(waiting).getByText('Payment hold ends in 2 hours')).toBeInTheDocument()
    expect(within(waiting).getByText(/Wedding · waiting 2 days/)).toBeInTheDocument()
    expect(within(waiting).getByText(/Refund of .*500\.00 due/)).toBeInTheDocument()
    expect(within(waiting).getByRole('link', { name: 'Take payment' })).toHaveAttribute('href', '/bookings/h1')
    expect(within(waiting).getByRole('link', { name: 'Record refund' })).toHaveAttribute('href', '/bookings/f1')
    expect(within(waiting).getByRole('link', { name: /Open the queue, 10 more/ })).toHaveAttribute('href', '/bookings?status=submitted')
    expect(within(waiting).getByRole('link', { name: 'Review next' })).toBeInTheDocument()
  })

  it('draws the next 14 days and the new bookings with every number printed and a text summary', async () => {
    setup()
    const ahead = await screen.findByRole('img', { name: 'Visits per day, November 4 to 17. 6 in total.' })
    expect(ahead).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Next 14 days' })).toHaveTextContent('6 visits')
    expect(screen.getByRole('img', { name: 'New bookings per day, October 21 to November 3. 38 in total, most on November 3 with 6.' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'New bookings' })).toHaveTextContent('38')
  })

  it('lists the visits due in the next two days, each with when', async () => {
    setup()
    const due = await screen.findByRole('region', { name: 'Due soon' })
    expect(within(due).getByText('Mateo Cruz')).toBeInTheDocument()
    expect(within(due).getByText('Today')).toBeInTheDocument()
    expect(within(due).getByText('8:00 AM')).toBeInTheDocument()
    expect(within(due).getByText('Tomorrow')).toBeInTheDocument()
    expect(within(due).getByText('Thu, Nov 5')).toBeInTheDocument()
    expect(within(due).getByRole('link', { name: /Ana Reyes/ })).toHaveAttribute('href', '/bookings/d2')
  })

  it('carries a print-only day sheet with the table, contacts, off-site address and the urgent footnote', async () => {
    setup()
    const sheet = await screen.findByTestId('day-sheet')
    expect(sheet).toHaveClass('hidden', 'print:flex')
    expect(within(sheet).getByRole('heading', { name: 'Tuesday, November 3, 2026' })).toBeInTheDocument()
    expect(within(sheet).getByText('Travel: 30 minutes before the off-site visit')).toBeInTheDocument()
    expect(within(sheet).getByText(/Off-site: San Juan, Balagtas, Bulacan/)).toBeInTheDocument()
    expect(within(sheet).getByText(/Walk-in\. Unpaid\./)).toBeInTheDocument()
    expect(within(sheet).getByText(/Paid\. Arrived 7:52 AM\./)).toBeInTheDocument()
    expect(within(sheet).getByText(/1 urgent request has no appointment time: Rosario Dela Cruz, anointing, call 0917 555 0142\./)).toBeInTheDocument()
  })

  it('prints the day when Print is pressed', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    setup()
    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(await screen.findByRole('button', { name: 'Print' }))
    expect(print).toHaveBeenCalled()
  })

  it('has no accessibility violations when loaded', async () => {
    const { container } = setup()
    await screen.findByRole('region', { name: 'Waiting for you' })
    await screen.findByText('Arrived')
    await expectNoA11yViolations(container)
  })

  it('degrades per panel when an older server leaves out parts of the response, instead of crashing the page', async () => {
    // A stale backend: no attention counts, no 14-day series, no due-soon list.
    const old = { byStatus: { submitted: 3 }, bySacrament: { baptism: 4 }, createdLast7Days: 5, createdLast30Days: 6, donations: { totalCentavos: 0, count: 0 } } as unknown as AdminAnalytics
    setup(old)
    for (const name of ['Waiting for you', 'Next 14 days', 'New bookings', 'Due soon']) {
      const panel = await screen.findByRole('region', { name })
      expect(within(panel).getByRole('alert')).toHaveTextContent(`${name} can't be shown right now.`)
    }
    // The rest of the dashboard still works.
    expect(screen.getByRole('region', { name: 'The day' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
  })

  describe('on a phone', () => {
    beforeEach(() => phone(true))

    it('shows Today and Waiting as tabs, with the waiting count', async () => {
      setup()
      const tabs = await screen.findByRole('tablist', { name: 'Dashboard sections' })
      expect(within(tabs).getByRole('tab', { name: 'Today' })).toHaveAttribute('aria-selected', 'true')
      expect(within(tabs).getByRole('tab', { name: /Waiting\s*13/ })).toBeInTheDocument()
      expect(screen.queryByRole('region', { name: 'Waiting for you' })).not.toBeInTheDocument()
      await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(within(tabs).getByRole('tab', { name: /Waiting/ }))
      const waiting = await screen.findByRole('region', { name: 'Waiting for you' })
      expect(within(waiting).getByText('items waiting')).toBeInTheDocument()
      expect(within(waiting).getByRole('link', { name: 'Record refund' })).toBeInTheDocument()
      expect(screen.queryByRole('region', { name: 'The day' })).not.toBeInTheDocument()
    })

    it('shows the week as a strip, and the month in a date picker', async () => {
      setup()
      const week = await screen.findByRole('group', { name: 'This week' })
      expect(within(week).getAllByRole('button')).toHaveLength(7)
      expect(within(week).getByRole('button', { name: /^November 3/ })).toHaveAttribute('aria-pressed', 'true')
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      await user.click(screen.getByRole('button', { name: 'Open the month' }))
      const dialog = await screen.findByRole('dialog')
      expect(within(dialog).getByRole('heading', { name: 'November 2026' })).toBeInTheDocument()
      await user.click(within(dialog).getByRole('button', { name: /^November 5/ }))
      await user.click(within(dialog).getByRole('button', { name: 'Show this day' }))
      await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('?date=2026-11-05'))
      expect(await screen.findByRole('heading', { name: 'Thursday, November 5' })).toBeInTheDocument()
    })

    it('moves between the tabs with the arrow keys', async () => {
      setup()
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      const today = await screen.findByRole('tab', { name: 'Today' })
      today.focus()
      await user.keyboard('{ArrowRight}')
      expect(screen.getByRole('tab', { name: /Waiting/ })).toHaveAttribute('aria-selected', 'true')
      expect(screen.getByRole('tab', { name: /Waiting/ })).toHaveFocus()
    })

    it('shows the caught-up card on the Waiting tab when nothing is waiting', async () => {
      setup(quiet, { travelBufferMinutes: 30, days: [], unscheduled: [] })
      await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(await screen.findByRole('tab', { name: /Waiting/ }))
      expect(await screen.findByText('You are all caught up')).toBeInTheDocument()
    })
  })
})
