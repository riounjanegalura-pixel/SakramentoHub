import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { WebHome } from './WebHome'
import { useAuthStore } from '../stores/auth-store'
import { setViewport } from '../test/viewport'
import { fetchBookings } from '../lib/data/bookings'
import { fetchUpcomingEvents } from '../lib/data/events'
import { expectNoA11yViolations } from '../test/a11y'

vi.mock('../lib/data/bookings', () => ({ fetchBookings: vi.fn() }))
vi.mock('../lib/data/events', () => ({ fetchUpcomingEvents: vi.fn() }))
vi.mock('../lib/data/notifications', () => ({ fetchNotifications: vi.fn(async () => []) }))
vi.mock('../lib/data/parish', () => ({
  fetchParishInfo: vi.fn(async () => ({ name: 'St. Peter the Apostle Parish', phone: '09123456789', priestName: 'Fr. X', workingHours: { start: '08:00', end: '17:00' } })),
}))

const original = window.matchMedia

const booking = (over: Record<string, unknown>) => ({
  id: 'b', referenceNumber: 'R', userId: 'u1', sacrament: 'wedding', status: 'approved', statusLabel: '', formData: {},
  appointmentDate: null, appointmentStart: null, appointmentEnd: null, isEmergency: false, paymentStatus: null,
  amountDueCentavos: 0, ...over,
})

const BOOKINGS = [
  booking({ id: 'b1', sacrament: 'wedding', status: 'approved', appointmentDate: '2026-11-08', appointmentStart: '10:00' }),
  booking({ id: 'b2', sacrament: 'baptism', status: 'submitted', paymentStatus: 'unpaid', appointmentDate: '2026-11-20', appointmentStart: '09:00' }),
  booking({ id: 'b3', sacrament: 'confirmation', status: 'returned', appointmentDate: '2026-11-15', appointmentStart: '09:00' }),
]
const EVENTS = [
  { id: 'e1', title: 'Sunday Mass', date: '2026-11-08T08:00:00', location: 'Church', imageUrl: '', category: 'mass' },
  { id: 'e2', title: 'Feast Day Procession', date: '2026-11-12T16:00:00', location: 'Plaza', imageUrl: '', category: 'general' },
]

function renderHome() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/home']}>
        <Routes>
          <Route path="/home" element={<WebHome />} />
          <Route path="/calendar" element={<p>calendar page</p>} />
          <Route path="/booking/:sacrament/:step" element={<p>wizard placeholder</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('WebHome', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 10, 5, 12, 0, 0))
    setViewport(1280)
    vi.mocked(fetchBookings).mockReset().mockResolvedValue(BOOKINGS as never)
    vi.mocked(fetchUpcomingEvents).mockReset().mockResolvedValue(EVENTS as never)
    useAuthStore.setState({ user: { id: 'u1', fullName: 'Rita Reyes', email: 'r@example.org', phone: '', address: '', emailVerifiedAt: '2026-01-01' } as never })
    Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture ?? (() => false)
    Element.prototype.setPointerCapture = Element.prototype.setPointerCapture ?? (() => {})
    Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture ?? (() => {})
    Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {})
  })
  afterEach(() => {
    vi.useRealTimers()
    window.matchMedia = original
    useAuthStore.setState({ user: null })
  })

  it('greets by first name', async () => {
    renderHome()
    expect(await screen.findByRole('heading', { level: 1, name: 'Welcome back, Rita' })).toBeInTheDocument()
  })

  it('draws the Next for you card on the navy panel: its text is white, so it must never sit on paper', async () => {
    renderHome()
    const card = (await screen.findByText(/Pay for your Baptism booking/)).closest('section')!
    expect(card.closest('[data-panel]')).not.toBeNull()
  })

  it('puts the payment that is due in the Next for you card, with one Pay now button', async () => {
    renderHome()
    const card = (await screen.findByText(/Pay for your Baptism booking/)).closest('section')!
    expect(within(card).getByRole('link', { name: 'Review and pay' })).toHaveAttribute('href', '/booking/history/b2')
  })

  it('shows the earliest upcoming booking in the card when nothing needs action, linking to it', async () => {
    vi.mocked(fetchBookings).mockResolvedValue([BOOKINGS[0], booking({ id: 'b4', sacrament: 'baptism', status: 'approved', appointmentDate: '2026-11-20', appointmentStart: '09:00' })] as never)
    renderHome()
    const link = await screen.findByRole('link', { name: /View booking/ })
    const card = link.closest('section')!
    expect(link).toHaveAttribute('href', '/booking/history/b1')
    expect(card).toHaveTextContent('Wedding')
    expect(card).toHaveTextContent('10:00 AM')
  })

  it('has no accessibility violations once loaded', async () => {
    const { container } = renderHome()
    await screen.findByRole('link', { name: 'Review and pay' })
    await screen.findAllByText('Sunday Mass')
    await expectNoA11yViolations(container, { fullPage: true })
  })

  it('shows a busy skeleton while loading', async () => {
    vi.mocked(fetchBookings).mockReturnValue(new Promise(() => {}) as never)
    renderHome()
    const note = await screen.findByText('Loading your home')
    expect(note.closest('[aria-busy="true"]')).not.toBeNull()
  })

  it('says what happened when bookings fail and Retry loads them again', async () => {
    vi.mocked(fetchBookings).mockRejectedValueOnce(new Error('x'))
    renderHome()
    expect(await screen.findByText(/couldn't load your bookings/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('link', { name: 'Review and pay' })).toBeInTheDocument()
  })

  it('lines the page up with the frame width', async () => {
    renderHome()
    await screen.findByRole('heading', { level: 1, name: 'Welcome back, Rita' })
    expect(document.querySelector('main')).toHaveClass('max-w-5xl')
  })

  it('says another booking needs the parishioner and links to My bookings', async () => {
    renderHome()
    const more = await screen.findByRole('link', { name: /1 more booking needs you/ })
    expect(more).toHaveAttribute('href', '/booking/history')
  })

  it('says Nothing needs you right now, with a link to Services, when there is no booking', async () => {
    vi.mocked(fetchBookings).mockResolvedValue([])
    renderHome()
    expect(await screen.findByText('Nothing needs you right now.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Book a sacrament' })).toHaveAttribute('href', '/services')
  })

  it('has one row into the sacrament list on Book, not a second copy of the list', async () => {
    renderHome()
    const row = (await screen.findByText('Baptism, wedding, funeral and more')).closest('a')
    expect(row).toHaveAttribute('href', '/services')
    expect(screen.queryByRole('button', { name: 'Baptism' })).not.toBeInTheDocument()
  })

  it('offers the emergency call in the side column, from the parish record', async () => {
    renderHome()
    const row = await screen.findByTestId('emergency-call')
    expect(within(row).getByRole('link', { name: /Call 09123456789/ })).toHaveAttribute('href', 'tel:09123456789')
  })

  it('lists the parish events with a way to the calendar', async () => {
    renderHome()
    const section = (await screen.findByRole('heading', { name: 'Coming up at the parish' })).closest('section')!
    expect(await within(section).findByText('Sunday Mass')).toBeInTheDocument()
    expect(within(section).getByText('Feast Day Procession')).toBeInTheDocument()
    await userEvent.click(within(section).getByRole('link', { name: 'See all' }))
    expect(await screen.findByText('calendar page')).toBeInTheDocument()
  })

  it('says No upcoming events when there are none', async () => {
    vi.mocked(fetchUpcomingEvents).mockResolvedValue([])
    renderHome()
    expect(await screen.findByText('No upcoming events.')).toBeInTheDocument()
  })

  it('shows an error with Retry when events fail to load', async () => {
    vi.mocked(fetchUpcomingEvents).mockRejectedValueOnce(new Error('x'))
    renderHome()
    expect(await screen.findByText(/couldn't load the parish events/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect((await screen.findAllByText('Sunday Mass')).length).toBeGreaterThan(0)
  })

  it('only ever loads bookings for the signed-in user', async () => {
    renderHome()
    await screen.findAllByText('Sunday Mass')
    expect(vi.mocked(fetchBookings).mock.calls.length).toBeGreaterThan(0)
    for (const call of vi.mocked(fetchBookings).mock.calls) expect(call[0]).toBe('u1')
  })

  it('shows the email verification banner when the email is unverified', async () => {
    useAuthStore.setState({ user: { id: 'u1', fullName: 'Rita Reyes', email: 'r@example.org', phone: '', address: '', emailVerifiedAt: null } as never })
    renderHome()
    expect(await screen.findByText('Please verify your email address')).toBeInTheDocument()
  })
})
