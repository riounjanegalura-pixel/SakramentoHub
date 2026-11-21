import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom'
import { EmergencyCallRow } from './EmergencyCallRow'
import { JourneyRailCompact } from './JourneyRailCompact'
import { NotificationsLink } from './NotificationsLink'
import { fetchParishInfo } from '../../lib/data/parish'
import { fetchNotifications } from '../../lib/data/notifications'
import { useAuthStore } from '../../stores/auth-store'
import { expectNoA11yViolations } from '../../test/a11y'

vi.mock('../../lib/data/parish', () => ({ fetchParishInfo: vi.fn() }))
vi.mock('../../lib/data/notifications', () => ({ fetchNotifications: vi.fn() }))

const wrap = (ui: React.ReactNode) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter>{ui}</MemoryRouter>
  </QueryClientProvider>
)
const parish = (phone: string) => ({ name: 'St. Peter', phone, priestName: 'Fr. X', workingHours: { start: '08:00', end: '17:00' } })

afterEach(() => useAuthStore.setState({ user: null }))

describe('EmergencyCallRow', () => {
  it('calls the number on the parish record, and says who it is for', async () => {
    vi.mocked(fetchParishInfo).mockResolvedValue(parish('0912 345 6789') as never)
    const { container } = render(wrap(<EmergencyCallRow />))
    const row = await screen.findByTestId('emergency-call')
    expect(row).toHaveTextContent('Need a priest right now?')
    expect(row).toHaveTextContent('Anointing of the Sick or a death in the family')
    expect(within(row).getByRole('link', { name: /Call/ })).toHaveAttribute('href', 'tel:09123456789')
    await expectNoA11yViolations(container)
  })

  it('draws nothing when the parish has no phone, so it can never show a wrong number', async () => {
    vi.mocked(fetchParishInfo).mockResolvedValue(parish('') as never)
    render(wrap(<EmergencyCallRow />))
    await vi.waitFor(() => expect(fetchParishInfo).toHaveBeenCalled())
    expect(screen.queryByTestId('emergency-call')).not.toBeInTheDocument()
  })
})

describe('NotificationsLink', () => {
  it('names the unread count in the link, and shows it as a number', async () => {
    useAuthStore.setState({ user: { id: 'u1' } as never })
    vi.mocked(fetchNotifications).mockResolvedValue([{ read: false }, { read: false }, { read: true }] as never)
    render(wrap(<NotificationsLink />))
    const link = await screen.findByRole('link', { name: 'Notifications, 2 unread' })
    expect(link).toHaveAttribute('href', '/notifications')
    expect(link).toHaveTextContent('2')
  })

  it('is a plain Notifications link with nothing unread', async () => {
    useAuthStore.setState({ user: { id: 'u1' } as never })
    vi.mocked(fetchNotifications).mockResolvedValue([{ read: true }] as never)
    render(wrap(<NotificationsLink />))
    expect(await screen.findByRole('link', { name: 'Notifications' })).toBeInTheDocument()
  })
})

describe('JourneyRailCompact', () => {
  const base = {
    id: 'b', referenceNumber: 'R', userId: 'u1', sacrament: 'baptism', status: 'approved', statusLabel: '', formData: {},
    appointmentDate: '2099-01-01', appointmentStart: '09:00', appointmentEnd: null, isEmergency: false, paymentStatus: 'paid',
    amountDueCentavos: 0, paymentHoldExpiresAt: null, createdAt: '2026-10-01T00:00:00Z',
  }

  it('says the stage in words with its place in the five, and draws five dots hidden from screen readers', () => {
    render(<JourneyRailCompact booking={base as never} />)
    const rail = screen.getByTestId('compact-rail')
    expect(rail).toHaveTextContent(/Step \d of 5/)
    expect(rail.querySelectorAll('[data-node]')).toHaveLength(5)
    expect(rail.querySelector('[aria-hidden="true"]')).not.toBeNull()
  })

  it('shows only the outcome for a declined booking, not a rail that goes nowhere', () => {
    render(<JourneyRailCompact booking={{ ...base, status: 'declined' } as never} />)
    expect(screen.queryByTestId('compact-rail')).not.toBeInTheDocument()
    expect(screen.getByText('Declined')).toBeInTheDocument()
  })

  it('does not animate: the fill belongs to the full rail', () => {
    render(<JourneyRailCompact booking={base as never} />)
    expect(screen.getByTestId('compact-rail').innerHTML).not.toMatch(/animate|transition|transform/)
  })
})
