import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom'
import { EventsListScreen } from './EventsListScreen'
import { fetchUpcomingEvents } from '../../lib/data/events'
import { expectNoA11yViolations } from '../../test/a11y'

vi.mock('../../lib/data/events', () => ({ fetchUpcomingEvents: vi.fn() }))

const EVENTS = [
  { id: 'e1', title: 'Sunday Mass', date: '2099-11-08T08:00:00', location: 'Church', imageUrl: '', category: 'mass' },
  { id: 'e2', title: 'Feast Day Procession', date: '2099-11-12T16:00:00', location: 'Plaza', imageUrl: '', category: 'general' },
]

const renderScreen = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <EventsListScreen />
      </MemoryRouter>
    </QueryClientProvider>,
  )

beforeEach(() => vi.mocked(fetchUpcomingEvents).mockReset().mockResolvedValue(EVENTS as never))

describe('EventsListScreen', () => {
  it('lists the events as plain dated rows: real time elements, no links, no chevrons, no placeholder pictures', async () => {
    const { container } = renderScreen()
    const list = await screen.findByRole('list', { name: 'Events' })
    const rows = within(list).getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(rows[0].querySelector('time')).toHaveAttribute('datetime', '2099-11-08T08:00:00')
    expect(within(list).queryByRole('link')).toBeNull()
    expect(container.querySelector('[role="img"]')).toBeNull()
    await expectNoA11yViolations(container)
  })

  it('has a labelled search and filters that say which one is pressed, and narrows the list', async () => {
    const user = userEvent.setup()
    renderScreen()
    await screen.findByRole('list', { name: 'Events' })
    await user.click(screen.getByRole('button', { name: 'Mass' }))
    expect(screen.getByRole('button', { name: 'Mass' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByText('Feast Day Procession')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'All' }))
    await user.type(screen.getByLabelText('Search events'), 'feast')
    expect(screen.queryByText('Sunday Mass')).not.toBeInTheDocument()
    expect(screen.getByText('Feast Day Procession')).toBeInTheDocument()
  })

  it('shows the readable category label on each row and can filter by a new category', async () => {
    vi.mocked(fetchUpcomingEvents).mockResolvedValue([
      ...EVENTS,
      { id: 'e3', title: 'Patron Saint Day', date: '2099-12-01T09:00:00', location: 'Plaza', imageUrl: '', category: 'feast' },
    ] as never)
    const user = userEvent.setup()
    renderScreen()
    const list = await screen.findByRole('list', { name: 'Events' })
    expect(within(list).getByText('Feast day')).toBeInTheDocument()
    expect(within(list).getByText('Parish event')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Feast day' }))
    expect(screen.getByText('Patron Saint Day')).toBeInTheDocument()
    expect(screen.queryByText('Sunday Mass')).not.toBeInTheDocument()
  })

  it('says there is nothing scheduled, and offers Try again when loading fails', async () => {
    vi.mocked(fetchUpcomingEvents).mockResolvedValue([])
    const first = renderScreen()
    expect(await screen.findByText('No events scheduled.')).toBeInTheDocument()
    first.unmount()
    vi.mocked(fetchUpcomingEvents).mockRejectedValueOnce(new Error('x')).mockResolvedValue(EVENTS as never)
    renderScreen()
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('list', { name: 'Events' })).toBeInTheDocument()
  })
})
