import { render, screen, waitFor, act, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom'
import userEvent from '@testing-library/user-event'
import { BookingsQueueScreen } from './BookingsQueueScreen'
import * as bookingsData from '../../lib/data/bookings'
import type { AdminBooking, Paginated } from '../../lib/types'
import { adminBooking as makeBooking, bookingDocument } from '../../test/factories'
import { LocationProbe } from '../../test/render'
import { expectNoA11yViolations } from '../../test/a11y'

function makePage(data: AdminBooking[], meta: Partial<Paginated<AdminBooking>['meta']> = {}): Paginated<AdminBooking> {
  return {
    data,
    links: { first: null, last: null, prev: null, next: null },
    meta: { current_page: 1, last_page: 1, per_page: 15, total: data.length, ...meta },
  }
}

function renderScreen(initialPath = '/bookings') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialPath]}>
        <BookingsQueueScreen />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function stubPhone(on: boolean) {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: on, media: q, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
}

/** The last arguments the list was asked for. */
const lastQuery = (spy: ReturnType<typeof vi.spyOn>) => spy.mock.calls.at(-1)![0] as Record<string, unknown>

const seven = [
  makeBooking({ id: '1', subjectName: 'Rosario Dela Cruz', sacrament: 'anointing', isEmergency: true, isPriority: true, referenceNumber: 'ANO-2026-0019' }),
  makeBooking({ id: '2', subjectName: 'Carla Mendoza', sacrament: 'wedding', referenceNumber: 'WED-2026-0021', paymentStatus: 'paid', amountDueCentavos: 300000, appointmentDate: '2030-12-14', appointmentStart: '10:00', appointmentEnd: '11:00', documents: [bookingDocument({ key: 'a' }), bookingDocument({ key: 'b' })] }),
  makeBooking({ id: '3', subjectName: 'Jun Reyes', sacrament: 'confirmation', status: 'returned', paymentStatus: 'unpaid', amountDueCentavos: 5000, referenceNumber: 'CON-2026-0036', user: { fullName: 'Jun Reyes', email: null, phone: null } }),
  makeBooking({ id: '4', subjectName: 'Lorenzo Pascual', sacrament: 'funeral', status: 'approved', paymentStatus: 'refund_due', amountDueCentavos: 50000, amountPaidCentavos: 50000, referenceNumber: 'FUN-2026-0031' }),
]

describe('BookingsQueueScreen', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(bookingsData, 'fetchBookingCounts').mockImplementation(async (q) => {
      const status = typeof q?.status === 'string' ? q.status : ''
      const total = ({ submitted: 17, approved: 41, completed: 142, '': 214 } as Record<string, number>)[status] ?? 3
      return { total, bySacrament: { baptism: 5, wedding: 7 } }
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  describe('the table', () => {
    it('shows each booking as one row: who, when, status, payment and the next step', async () => {
      vi.spyOn(bookingsData, 'fetchBookings').mockResolvedValue(makePage(seven))
      renderScreen()
      const carla = (await screen.findByRole('link', { name: 'Carla Mendoza' })).closest('li')!
      expect(carla).toHaveTextContent('Wedding · WED-2026-0021')
      expect(carla).toHaveTextContent('Dec 14, 10:00 AM')
      expect(carla).toHaveTextContent('Awaiting review')
      expect(carla).toHaveTextContent('Paid')
      expect(carla).toHaveTextContent('Review 2 documents')
      expect(within(carla).getByText('WED-2026-0021')).toHaveClass('font-mono')
      expect(screen.getByRole('link', { name: 'Carla Mendoza' })).toHaveAttribute('href', '/bookings/2')
    })

    it('words the next step for each situation', async () => {
      vi.spyOn(bookingsData, 'fetchBookings').mockResolvedValue(makePage(seven))
      renderScreen()
      const row = async (name: string) => (await screen.findByRole('link', { name })).closest('li')!
      expect(await row('Rosario Dela Cruz')).toHaveTextContent('Call the family now, then review')
      expect(await row('Jun Reyes')).toHaveTextContent('Waiting for Jun to send changes')
      expect(await row('Lorenzo Pascual')).toHaveTextContent('Record the ₱500.00 refund')
      expect(await row('Lorenzo Pascual')).toHaveTextContent('Refund due')
      expect(await row('Rosario Dela Cruz')).toHaveTextContent('No time: urgent')
    })

    it('labels only a real emergency "Urgent"; other time-sensitive bookings say "Priority"', async () => {
      vi.spyOn(bookingsData, 'fetchBookings').mockResolvedValue(
        makePage([
          makeBooking({ id: '1', sacrament: 'anointing', isPriority: true, isEmergency: true, subjectName: 'A' }),
          makeBooking({ id: '2', sacrament: 'funeral', isPriority: true, isEmergency: false, subjectName: 'B' }),
          makeBooking({ id: '3', sacrament: 'baptism', isPriority: false, channel: 'walk_in', subjectName: 'C' }),
        ]),
      )
      renderScreen()
      expect(await screen.findAllByText('Urgent')).toHaveLength(1)
      expect(screen.getAllByText('Priority')).toHaveLength(1)
      expect(screen.getAllByText('Walk-in')).toHaveLength(1)
    })

    it('opens a booking from the name link, and a Quick view from its own button that returns focus when it closes', async () => {
      vi.spyOn(bookingsData, 'fetchBookings').mockResolvedValue(makePage(seven))
      renderScreen()
      const quick = await screen.findByRole('button', { name: 'Quick view Carla Mendoza' })
      await userEvent.click(quick)
      const peek = await screen.findByRole('dialog', { name: 'Carla Mendoza' })
      expect(within(peek).getByText('Review 2 documents')).toBeInTheDocument()
      await userEvent.keyboard('{Escape}')
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      await waitFor(() => expect(quick).toHaveFocus())
    })

    it('opens the full booking from the Quick view', async () => {
      vi.spyOn(bookingsData, 'fetchBookings').mockResolvedValue(makePage(seven))
      renderScreen()
      await userEvent.click(await screen.findByRole('button', { name: 'Quick view Carla Mendoza' }))
      await userEvent.click(await screen.findByRole('button', { name: 'Open booking' }))
      expect(screen.getByTestId('location')).toHaveTextContent('/bookings')
    })

    it('says how many are shown, and pages with Previous and Next', async () => {
      const spy = vi.spyOn(bookingsData, 'fetchBookings').mockImplementation(async (q) =>
        makePage(seven, { total: 40, last_page: 3, per_page: 15, current_page: q?.page ?? 1 }),
      )
      renderScreen()
      expect(await screen.findByText('Showing 1–4 of 40')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
      await userEvent.click(screen.getByRole('button', { name: 'Next' }))
      await waitFor(() => expect(lastQuery(spy).page).toBe(2))
      expect(await screen.findByText('Showing 16–19 of 40')).toBeInTheDocument()
    })
  })

  describe('the views', () => {
    it('shows four views with their counts, Waiting for me first', async () => {
      vi.spyOn(bookingsData, 'fetchBookings').mockResolvedValue(makePage(seven))
      renderScreen('/bookings?status=submitted')
      await screen.findByRole('tab', { name: 'All 214' })
      const tabs = screen.getAllByRole('tab')
      expect(tabs.map((t) => t.textContent?.replace(/\s+/g, ' ').trim())).toEqual(['Waiting for me 17', 'Upcoming 41', 'Completed 142', 'All 214'])
      expect(screen.getByRole('tab', { name: /Waiting for me/ })).toHaveAttribute('aria-selected', 'true')
    })

    it('treats no status as the All view, and a Dashboard link for refunds as All with the payment filter', async () => {
      const spy = vi.spyOn(bookingsData, 'fetchBookings').mockResolvedValue(makePage(seven))
      renderScreen('/bookings?paymentStatus=refund_due')
      await screen.findByRole('link', { name: 'Carla Mendoza' })
      expect(screen.getByRole('tab', { name: /^All/ })).toHaveAttribute('aria-selected', 'true')
      expect(lastQuery(spy).paymentStatus).toEqual(['refund_due'])
    })

    it('selects no view for a status that has none', async () => {
      vi.spyOn(bookingsData, 'fetchBookings').mockResolvedValue(makePage(seven))
      renderScreen('/bookings?status=declined')
      await screen.findByRole('link', { name: 'Carla Mendoza' })
      for (const t of screen.getAllByRole('tab')) expect(t).toHaveAttribute('aria-selected', 'false')
    })

    it('choosing a view filters by that status and keeps the address linkable', async () => {
      const spy = vi.spyOn(bookingsData, 'fetchBookings').mockResolvedValue(makePage(seven))
      renderScreen()
      await userEvent.click(await screen.findByRole('tab', { name: /Upcoming/ }))
      await waitFor(() => expect(lastQuery(spy).status).toEqual(['approved']))
      expect(screen.getByTestId('location')).toHaveTextContent('/bookings?status=approved')
      await userEvent.click(screen.getByRole('tab', { name: /^All/ }))
      await waitFor(() => expect(lastQuery(spy).status).toEqual([]))
      expect(screen.getByTestId('location')).toHaveTextContent(/^\/bookings$/)
    })

    it('moves between views with the arrow keys', async () => {
      vi.spyOn(bookingsData, 'fetchBookings').mockResolvedValue(makePage(seven))
      renderScreen('/bookings?status=submitted')
      const first = await screen.findByRole('tab', { name: /Waiting for me/ })
      first.focus()
      await userEvent.keyboard('{ArrowRight}')
      expect(screen.getByRole('tab', { name: /Upcoming/ })).toHaveFocus()
      expect(screen.getByTestId('location')).toHaveTextContent('status=approved')
    })

    it('adds the counts of the chosen sacraments, since the counts request ignores that filter', async () => {
      vi.spyOn(bookingsData, 'fetchBookings').mockResolvedValue(makePage(seven))
      renderScreen('/bookings?status=submitted&sacrament=baptism,wedding')
      expect(await screen.findByRole('tab', { name: /Waiting for me 12/ })).toBeInTheDocument()
    })
  })

  describe('filters', () => {
    it('re-fetches with several chosen sacraments, and the button names them', async () => {
      const spy = vi.spyOn(bookingsData, 'fetchBookings').mockResolvedValue(makePage(seven))
      renderScreen()
      await userEvent.click(await screen.findByRole('button', { name: /^Sacrament/ }))
      const group = screen.getByRole('group', { name: 'Sacrament' })
      await userEvent.click(within(group).getByRole('checkbox', { name: 'Wedding' }))
      await userEvent.click(within(group).getByRole('checkbox', { name: 'Baptism' }))
      await waitFor(() => expect(lastQuery(spy).sacrament).toEqual(['wedding', 'baptism']))
      expect(screen.getByRole('button', { name: 'Sacrament: Baptism, Wedding' })).toBeInTheDocument()
      expect(screen.getByTestId('location')).toHaveTextContent('sacrament=wedding%2Cbaptism')
    })

    it('summarises more than two values by their number', async () => {
      vi.spyOn(bookingsData, 'fetchBookings').mockResolvedValue(makePage(seven))
      renderScreen('/bookings?paymentStatus=paid,unpaid,refund_due')
      expect(await screen.findByRole('button', { name: 'Payment: 3 selected' })).toBeInTheDocument()
    })

    it('re-fetches with the chosen status, payment and channel', async () => {
      const spy = vi.spyOn(bookingsData, 'fetchBookings').mockResolvedValue(makePage([]))
      renderScreen()
      await userEvent.click(await screen.findByRole('button', { name: /^Status/ }))
      await userEvent.click(within(screen.getByRole('group', { name: 'Status' })).getByRole('checkbox', { name: 'Approved' }))
      await waitFor(() => expect(lastQuery(spy).status).toEqual(['approved']))
      await userEvent.keyboard('{Escape}')
      await userEvent.click(screen.getByRole('button', { name: /^More filters/ }))
      await userEvent.click(screen.getByRole('checkbox', { name: 'Walk-in' }))
      await waitFor(() => expect(lastQuery(spy).channel).toEqual(['walk_in']))
    })

    it('ignores unknown values in the address', async () => {
      const spy = vi.spyOn(bookingsData, 'fetchBookings').mockResolvedValue(makePage([]))
      renderScreen('/bookings?status=nonsense,approved&sacrament=lunch&paymentStatus=free')
      await waitFor(() => expect(spy).toHaveBeenCalled())
      expect(lastQuery(spy)).toMatchObject({ status: ['approved'], sacrament: [], paymentStatus: [] })
    })

    it('filters by an appointment range only when both dates are set, and says so', async () => {
      const spy = vi.spyOn(bookingsData, 'fetchBookings').mockResolvedValue(makePage(seven))
      renderScreen()
      await userEvent.click(await screen.findByRole('button', { name: /^More filters/ }))
      await userEvent.type(screen.getByLabelText('Appointment from'), '2030-01-01')
      expect(screen.getByText('Set both dates to filter by appointment.')).toBeInTheDocument()
      await userEvent.type(screen.getByLabelText('Appointment to'), '2030-01-31')
      await waitFor(() => expect(lastQuery(spy)).toMatchObject({ from: '2030-01-01', to: '2030-01-31' }))
      expect(screen.getByRole('button', { name: 'More filters: 1' })).toBeInTheDocument()
    })

    it('ignores the date range for drafts and disables its inputs', async () => {
      const spy = vi.spyOn(bookingsData, 'fetchBookings').mockResolvedValue(makePage([]))
      renderScreen('/bookings?status=draft&from=2030-01-01&to=2030-01-31')
      await userEvent.click(await screen.findByRole('button', { name: /^More filters/ }))
      expect(screen.getByLabelText('Appointment from')).toBeDisabled()
      expect(screen.getByText('Drafts have no confirmed date yet.')).toBeInTheDocument()
      expect(lastQuery(spy)).toMatchObject({ from: '', to: '' })
    })

    it('puts urgent bookings first on request', async () => {
      const spy = vi.spyOn(bookingsData, 'fetchBookings').mockResolvedValue(makePage(seven))
      renderScreen()
      await userEvent.click(await screen.findByRole('button', { name: /^More filters/ }))
      await userEvent.click(screen.getByRole('checkbox', { name: 'Urgent first' }))
      await waitFor(() => expect(lastQuery(spy).priority).toBe(true))
    })

    it('shows and removes the overpaid filter the Dashboard can link to', async () => {
      const spy = vi.spyOn(bookingsData, 'fetchBookings').mockResolvedValue(makePage(seven))
      renderScreen('/bookings?attention=overpaid')
      expect(await screen.findByText('Overpaid only')).toBeInTheDocument()
      expect(lastQuery(spy).attention).toBe('overpaid')
      await userEvent.click(screen.getByRole('button', { name: 'Remove overpaid filter' }))
      await waitFor(() => expect(lastQuery(spy).attention).toBe(''))
    })

    it('searches once typing pauses, not on every key', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      try {
        const spy = vi.spyOn(bookingsData, 'fetchBookings').mockResolvedValue(makePage([]))
        renderScreen()
        const box = await screen.findByRole('searchbox', { name: 'Search bookings' })
        const before = spy.mock.calls.length
        await userEvent.type(box, 'Dizon', { delay: null })
        expect(spy.mock.calls.length).toBe(before)
        await act(async () => {
          await vi.advanceTimersByTimeAsync(350)
        })
        await waitFor(() => expect(lastQuery(spy).search).toBe('Dizon'))
      } finally {
        vi.useRealTimers()
      }
    })

    it('clears every filter and the search in one step', async () => {
      const spy = vi.spyOn(bookingsData, 'fetchBookings').mockResolvedValue(makePage(seven))
      renderScreen('/bookings?status=approved&sacrament=wedding&paymentStatus=paid')
      await screen.findByRole('link', { name: 'Carla Mendoza' })
      await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
      await waitFor(() => expect(lastQuery(spy)).toMatchObject({ status: [], sacrament: [], paymentStatus: [] }))
      expect(screen.getByTestId('location')).toHaveTextContent(/^\/bookings$/)
      expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument()
    })
  })

  describe('the other states', () => {
    it('shows a loading skeleton while the first page comes in', () => {
      vi.spyOn(bookingsData, 'fetchBookings').mockReturnValue(new Promise(() => {}))
      renderScreen()
      expect(screen.getByRole('status', { name: 'Loading bookings' })).toHaveAttribute('aria-busy', 'true')
    })

    it('says the bookings did not load, with the system message and a retry', async () => {
      const spy = vi.spyOn(bookingsData, 'fetchBookings').mockRejectedValueOnce(new Error('Network unreachable')).mockResolvedValue(makePage(seven))
      renderScreen()
      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent("Bookings didn't load")
      expect(alert).toHaveTextContent('Network unreachable')
      await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
      expect(await screen.findByRole('link', { name: 'Carla Mendoza' })).toBeInTheDocument()
      expect(spy).toHaveBeenCalledTimes(2)
    })

    it('says nothing matches the filters, and clears them', async () => {
      vi.spyOn(bookingsData, 'fetchBookings').mockResolvedValue(makePage([]))
      renderScreen('/bookings?status=approved')
      expect(await screen.findByText('No bookings match these filters')).toBeInTheDocument()
      await userEvent.click(screen.getAllByRole('button', { name: 'Clear filters' }).at(-1)!)
      expect(await screen.findByText('No bookings in this view')).toBeInTheDocument()
    })

    it('names the search term when nothing matches it', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      try {
        vi.spyOn(bookingsData, 'fetchBookings').mockResolvedValue(makePage([]))
        renderScreen()
        await userEvent.type(await screen.findByRole('searchbox'), 'Dizon 2019', { delay: null })
        await act(async () => {
          await vi.advanceTimersByTimeAsync(350)
        })
        expect(await screen.findByText('No bookings match "Dizon 2019"')).toBeInTheDocument()
      } finally {
        vi.useRealTimers()
      }
    })

    it('explains that drafts are not dated when a date range finds nothing', async () => {
      vi.spyOn(bookingsData, 'fetchBookings').mockResolvedValue(makePage([]))
      renderScreen('/bookings?from=2030-01-01&to=2030-01-31')
      expect(await screen.findByText(/Drafts are not dated/)).toBeInTheDocument()
    })

    it('has no accessibility violations', async () => {
      vi.spyOn(bookingsData, 'fetchBookings').mockResolvedValue(makePage(seven))
      const { container } = renderScreen()
      await screen.findByRole('link', { name: 'Carla Mendoza' })
      await expectNoA11yViolations(container, { fullPage: true })
    })
  })

  describe('on a phone', () => {
    beforeEach(() => stubPhone(true))

    it('shows each booking as a card that opens it, with the next step at the bottom', async () => {
      vi.spyOn(bookingsData, 'fetchBookings').mockResolvedValue(makePage(seven, { total: 17 }))
      renderScreen()
      const card = (await screen.findByText('Carla Mendoza')).closest('a')!
      expect(card).toHaveAttribute('href', '/bookings/2')
      expect(card).toHaveTextContent('Wedding · WED-2026-0021')
      expect(card).toHaveTextContent('Review 2 documents')
      expect(screen.queryByRole('button', { name: /^Quick view/ })).not.toBeInTheDocument()
      expect(screen.getByText('Showing 1–4 of 17')).toBeInTheDocument()
    })

    it('marks an urgent request on its card', async () => {
      vi.spyOn(bookingsData, 'fetchBookings').mockResolvedValue(makePage(seven))
      renderScreen()
      const card = (await screen.findByText('Rosario Dela Cruz')).closest('a')!
      expect(card).toHaveTextContent('Urgent')
      expect(card).toHaveTextContent('No time, urgent')
    })

    it('opens filters in a bottom sheet of chips and shows how many bookings they leave', async () => {
      const spy = vi.spyOn(bookingsData, 'fetchBookings').mockImplementation(async (q) => {
        const n = Array.isArray(q?.sacrament) ? q.sacrament.length : 0
        return makePage(seven.slice(0, n === 0 ? 4 : 3), { total: n === 0 ? 17 : 3 })
      })
      renderScreen()
      const open = await screen.findByRole('button', { name: /^Filters/ })
      expect(open).not.toHaveTextContent(/\d/)
      await userEvent.click(open)
      const sheet = await screen.findByRole('dialog', { name: 'Filters' })
      for (const group of ['Sacrament', 'Status', 'Payment', 'How it came in']) {
        expect(within(sheet).getByRole('group', { name: group })).toBeInTheDocument()
      }
      const wedding = within(sheet).getByRole('button', { name: 'Wedding' })
      expect(wedding).toHaveAttribute('aria-pressed', 'false')
      await userEvent.click(wedding)
      expect(wedding).toHaveAttribute('aria-pressed', 'true')
      await waitFor(() => expect(lastQuery(spy).sacrament).toEqual(['wedding']))
      expect(await within(sheet).findByRole('button', { name: 'Show 3 bookings' })).toBeInTheDocument()
      await userEvent.click(within(sheet).getByRole('button', { name: 'Show 3 bookings' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(screen.getByRole('button', { name: /^Filters 1/ })).toBeInTheDocument()
    })

    it('clears the filters from the sheet', async () => {
      const spy = vi.spyOn(bookingsData, 'fetchBookings').mockResolvedValue(makePage(seven))
      renderScreen('/bookings?paymentStatus=paid&channel=walk_in')
      expect(await screen.findByRole('button', { name: /^Filters 2/ })).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: /^Filters/ }))
      await userEvent.click(within(await screen.findByRole('dialog', { name: 'Filters' })).getByRole('button', { name: 'Clear filters' }))
      await waitFor(() => expect(lastQuery(spy)).toMatchObject({ paymentStatus: [], channel: [] }))
    })

    it('keeps the four views in a row that scrolls sideways', async () => {
      vi.spyOn(bookingsData, 'fetchBookings').mockResolvedValue(makePage(seven))
      renderScreen()
      expect(await screen.findByRole('tablist', { name: 'Booking views' })).toHaveClass('overflow-x-auto')
    })

    it('has no accessibility violations', async () => {
      vi.spyOn(bookingsData, 'fetchBookings').mockResolvedValue(makePage(seven))
      const { container } = renderScreen()
      await screen.findByText('Carla Mendoza')
      await expectNoA11yViolations(container, { fullPage: true })
    })
  })
})
