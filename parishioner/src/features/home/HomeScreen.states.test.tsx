import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LazyMotion, domMax } from 'motion/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom'
import { HomeScreen } from './HomeScreen'
import { useAuthStore } from '../../stores/auth-store'
import { setViewport } from '../../test/viewport'
import { expectNoA11yViolations } from '../../test/a11y'
import { fetchBookings } from '../../lib/data/bookings'
import { fetchUpcomingEvents } from '../../lib/data/events'

const motion = vi.hoisted(() => ({ reduced: false }))
vi.mock('motion/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('motion/react')>()),
  useReducedMotion: () => motion.reduced,
}))
vi.mock('../../lib/data/bookings', () => ({ fetchBookings: vi.fn() }))
vi.mock('../../lib/data/events', () => ({ fetchUpcomingEvents: vi.fn() }))
vi.mock('../../lib/data/notifications', () => ({ fetchNotifications: vi.fn(async () => []) }))
vi.mock('../../lib/data/parish', () => ({
  fetchParishInfo: vi.fn(async () => ({ name: 'St. Peter the Apostle Parish', phone: '09123456789', priestName: 'Fr. X', workingHours: { start: '08:00', end: '17:00' } })),
}))

const booking = (over: Record<string, unknown>) => ({
  id: 'b', referenceNumber: 'R', userId: 'u1', sacrament: 'wedding', status: 'approved', statusLabel: '', formData: {},
  appointmentDate: null, appointmentStart: null, appointmentEnd: null, isEmergency: false, paymentStatus: null,
  amountDueCentavos: 0, paymentHoldExpiresAt: null, createdAt: '2026-10-01T00:00:00Z', ...over,
})
const PAY = booking({ id: 'pay', sacrament: 'wedding', status: 'submitted', paymentStatus: 'unpaid', amountDueCentavos: 150000, paymentHoldExpiresAt: '2099-10-14T09:00:00Z', appointmentDate: '2099-11-20', appointmentStart: '09:00' })
const EVENTS = [
  { id: 'e1', title: 'Sunday Mass', date: '2099-11-08T08:00:00', location: 'Church', imageUrl: '', category: 'mass' },
  { id: 'e2', title: 'Feast Day Procession', date: '2099-11-12T16:00:00', location: 'Plaza', imageUrl: '', category: 'general' },
]

const original = window.matchMedia
function renderHome() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <LazyMotion features={domMax}>
        <MemoryRouter initialEntries={['/home']}>
          <HomeScreen />
        </MemoryRouter>
      </LazyMotion>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  motion.reduced = false
  setViewport(390)
  vi.mocked(fetchBookings).mockReset().mockResolvedValue([] as never)
  vi.mocked(fetchUpcomingEvents).mockReset().mockResolvedValue(EVENTS as never)
  useAuthStore.setState({ user: { id: 'u1', fullName: 'Rio Dela Cruz', email: 'r@x.com', phone: '', address: '', emailVerifiedAt: '2026-01-01' } as never })
})
afterEach(() => {
  window.matchMedia = original
  useAuthStore.setState({ user: null })
})

describe('HomeScreen next-action card', () => {
  it('asks the parishioner to pay, with the deadline and amount in numerals and one Pay now button', async () => {
    vi.mocked(fetchBookings).mockResolvedValue([PAY] as never)
    renderHome()
    const card = (await screen.findByText(/Pay for your Wedding booking by/)).closest('section')!
    expect(within(card).getByText('Next for you')).toBeInTheDocument()
    expect(card).toHaveAccessibleName('Next for you')
    // Figures are Inter with tabular numerals; mono is for reference numbers only.
    expect(card.querySelector('.tabular-nums')).not.toBeNull()
    expect(card.querySelector('.numeric')).toBeNull()
    expect(card).toHaveTextContent('₱1,500.00')
    const pay = within(card).getByRole('link', { name: 'Review and pay' })
    expect(pay).toHaveAttribute('href', '/booking/history/pay')
    expect(within(card).getAllByRole('link')).toHaveLength(1)
  })

  it('puts the button before the compact rail in reading order and says the step in words', async () => {
    vi.mocked(fetchBookings).mockResolvedValue([PAY] as never)
    renderHome()
    const card = (await screen.findByText(/Pay for your Wedding booking by/)).closest('section')!
    const button = within(card).getByRole('link', { name: 'Review and pay' })
    const rail = within(card).getByTestId('compact-rail')
    expect(button.compareDocumentPosition(rail) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(rail).toHaveTextContent(/Step 2 of 5/)
    expect(rail).toHaveTextContent('Under review')
  })

  it('shows the plain empty state with the one next step', async () => {
    renderHome()
    const card = (await screen.findByText('Nothing needs you right now.')).closest('section')!
    expect(within(card).getByRole('link', { name: 'Book a sacrament' })).toHaveAttribute('href', '/services')
  })

  it('shows a skeleton of the final layout, busy and announced, while loading', async () => {
    vi.mocked(fetchBookings).mockReturnValue(new Promise(() => {}) as never)
    vi.mocked(fetchUpcomingEvents).mockReturnValue(new Promise(() => {}) as never)
    renderHome()
    expect(await screen.findByText('Loading your home')).toBeInTheDocument()
    expect(screen.getByText('Loading your home').closest('[aria-busy="true"]')).not.toBeNull()
    expect(document.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(2)
  })

  it('says what happened when bookings fail, and Retry refetches', async () => {
    vi.mocked(fetchBookings).mockRejectedValueOnce(new Error('x')).mockResolvedValue([PAY] as never)
    renderHome()
    expect(await screen.findByText(/couldn't load your bookings/i)).toBeInTheDocument()
    // the rest of the page keeps its context
    expect(screen.getByRole('heading', { level: 1, name: /Welcome back, Rio/ })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('link', { name: 'Review and pay' })).toBeInTheDocument()
    expect(vi.mocked(fetchBookings)).toHaveBeenCalledTimes(2)
  })

  it('has no glow, gradient or shadow behind the card', async () => {
    vi.mocked(fetchBookings).mockResolvedValue([PAY] as never)
    renderHome()
    await screen.findByRole('link', { name: 'Review and pay' })
    expect(document.querySelector('[data-testid="next-action-field"]')).toBeNull()
    const card = screen.getByTestId('next-action')
    expect(card.className).not.toMatch(/shadow|gradient|border/)
    // The card is the content of the one navy cover, so the cover is the only Panel on the screen.
    expect(card.closest('[data-panel]')).not.toBeNull()
    expect(document.querySelectorAll('[data-panel]')).toHaveLength(1)
  })

  it('has no emoji in the greeting', async () => {
    renderHome()
    const h1 = await screen.findByRole('heading', { level: 1 })
    expect(h1.textContent).not.toMatch(/\p{Extended_Pictographic}/u)
  })
})

describe('HomeScreen layout', () => {
  it('orders the next step (the cover), urgent help, the way into Book, then the parish', async () => {
    vi.mocked(fetchBookings).mockResolvedValue([PAY] as never)
    renderHome()
    await screen.findByRole('link', { name: 'Review and pay' })
    await screen.findByText('Sunday Mass')
    const order = [
      screen.getByTestId('next-action'),
      screen.getByTestId('emergency-call'),
      screen.getByText('Baptism, wedding, funeral and more'),
      screen.getByRole('heading', { name: 'Coming up at the parish' }),
    ]
    for (let i = 1; i < order.length; i++) {
      expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
  })

  it('offers the emergency call from the parish record, as a tel link', async () => {
    renderHome()
    const row = await screen.findByTestId('emergency-call')
    expect(within(row).getByRole('link', { name: /Call 09123456789/ })).toHaveAttribute('href', 'tel:09123456789')
  })

  it('lists the parish events as plain dated rows with real time elements and a way to the rest', async () => {
    renderHome()
    const section = (await screen.findByRole('heading', { name: 'Coming up at the parish' })).closest('section')!
    const rows = await within(section).findAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('Sunday Mass')
    expect(rows[0].querySelector('time')).toHaveAttribute('datetime', '2099-11-08T08:00:00')
    expect(within(rows[0]).queryByRole('link')).toBeNull()
    expect(within(section).getByRole('link', { name: 'See all' })).toHaveAttribute('href', '/calendar')
  })

  it('says another booking needs the parishioner and links to My bookings, instead of hiding it', async () => {
    const SECOND = booking({ id: 'pay2', sacrament: 'baptism', status: 'returned', createdAt: '2026-10-02T00:00:00Z' })
    vi.mocked(fetchBookings).mockResolvedValue([PAY, SECOND] as never)
    renderHome()
    const more = await screen.findByRole('link', { name: /1 more booking needs you/ })
    expect(more).toHaveAttribute('href', '/booking/history')
  })

  it('does not show a "more" link when only the shown booking needs the parishioner', async () => {
    vi.mocked(fetchBookings).mockResolvedValue([PAY] as never)
    renderHome()
    await screen.findByRole('link', { name: 'Review and pay' })
    expect(screen.queryByRole('link', { name: /more booking/ })).not.toBeInTheDocument()
  })

  it('has no accessibility violations once loaded', async () => {
    vi.mocked(fetchBookings).mockResolvedValue([PAY] as never)
    const { container } = renderHome()
    await screen.findByRole('link', { name: 'Review and pay' })
    await screen.findByText('Sunday Mass')
    await expectNoA11yViolations(container)
  })

  it('has no accessibility violations while loading', async () => {
    vi.mocked(fetchBookings).mockReturnValue(new Promise(() => {}) as never)
    const { container } = renderHome()
    await screen.findByText('Loading your home')
    await expectNoA11yViolations(container)
  })

  it('keeps the donation dialog reachable from a plain row, until the owner revises it', async () => {
    renderHome()
    const row = await screen.findByRole('button', { name: 'Support our parish' })
    expect(row.className).not.toMatch(/fixed|rounded-full|shadow/)
    await userEvent.click(row)
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  it('links to documents and certificates', async () => {
    renderHome()
    expect(await screen.findByRole('link', { name: /Documents and certificates/ })).toHaveAttribute('href', '/wallet')
  })

  it('tells a lapsed payment hold apart from an appointment', async () => {
    vi.mocked(fetchBookings).mockResolvedValue([booking({ id: 'l', status: 'submitted', paymentStatus: 'unpaid', paymentHoldExpiresAt: '2020-01-01T00:00:00Z', appointmentDate: '2099-11-20', appointmentStart: '09:00' })] as never)
    renderHome()
    expect(await screen.findByText(/payment window for your Wedding booking ended/i)).toBeInTheDocument()
    expect(screen.queryByText(/Nothing is needed from you/)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View booking' })).toHaveAttribute('href', '/booking/history/l')
  })

  it('says a submitted booking is waiting for approval, not confirmed', async () => {
    vi.mocked(fetchBookings).mockResolvedValue([booking({ id: 's', status: 'submitted', paymentStatus: 'paid', appointmentDate: '2099-11-20', appointmentStart: '09:00' })] as never)
    renderHome()
    expect(await screen.findByText(/Your Wedding is waiting for approval for/)).toBeInTheDocument()
  })
})

describe('HomeScreen cover and appointments', () => {
  it('puts the greeting, the wordmark and the bell on the navy cover, and the pay action as the paper button', async () => {
    vi.mocked(fetchBookings).mockResolvedValue([PAY] as never)
    renderHome()
    const pay = await screen.findByRole('link', { name: 'Review and pay' })
    const cover = pay.closest('[data-panel]')!
    expect(within(cover as HTMLElement).getByRole('heading', { level: 1, name: /Welcome back, Rio/ })).toBeInTheDocument()
    expect(within(cover as HTMLElement).getByRole('link', { name: 'Notifications' })).toBeInTheDocument()
    expect(pay).toHaveClass('bg-paper', 'text-navy')
  })

  it('shows the amount large, and still says "Amount due" to a screen reader', async () => {
    vi.mocked(fetchBookings).mockResolvedValue([PAY] as never)
    renderHome()
    const card = (await screen.findByText(/Pay for your Wedding booking by/)).closest('section')!
    expect(within(card).getByText('₱1,500.00')).toHaveClass('tabular-nums')
    expect(card).toHaveTextContent('Amount due ₱1,500.00.')
    expect(card).toHaveTextContent('Paying keeps your slot.')
  })

  it('lists the next appointments as tickets that link to the booking', async () => {
    vi.mocked(fetchBookings).mockResolvedValue([PAY] as never)
    renderHome()
    const section = (await screen.findByRole('heading', { name: 'Your appointments' })).closest('section')!
    const ticket = within(section).getByRole('link')
    expect(ticket).toHaveAttribute('href', '/booking/history/pay')
    expect(ticket).toHaveTextContent('Wedding')
    expect(ticket).toHaveTextContent('Awaiting review')
  })

  it('has no appointments section when nothing is booked', async () => {
    renderHome()
    await screen.findByText('Nothing needs you right now.')
    expect(screen.queryByRole('heading', { name: 'Your appointments' })).toBeNull()
  })
})
