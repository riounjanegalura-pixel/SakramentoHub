import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom'
import { CalendarScreen } from './CalendarScreen'
import { useAuthStore } from '../../stores/auth-store'
import { seedBooking } from '../../test/seed'

describe('CalendarScreen', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 7, 30, 12, 0, 0))
    localStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
    useAuthStore.setState({ user: null })
  })

  it('renders a month grid above the events list', async () => {
    const client = new QueryClient()
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/calendar?view=month']}>
          <CalendarScreen />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    await waitFor(() => {
      expect(screen.getByText('Sunday Mass')).toBeInTheDocument()
    })
    expect(screen.getByRole('heading', { name: 'Schedule for Today' })).toBeInTheDocument()
    expect(screen.getByText('S')).toBeInTheDocument()
  })

  it('shows the parish name from the parish record under the Calendar title', async () => {
    const client = new QueryClient()
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/calendar?view=month']}>
          <CalendarScreen />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(await screen.findByText('St. Peter the Apostle Parish')).toBeInTheDocument()
  })

  // Regression test: previously this screen only ever showed parish events —
  // a parishioner's own appointment never appeared on their own calendar.
  it("shows the parishioner's own submitted booking on today's schedule, not just parish events", async () => {
    useAuthStore.setState({
      user: { id: 'user-1', fullName: 'Rio', email: 'r@x.com', phone: '', address: '' },
    })
    seedBooking({ sacrament: 'wedding', status: 'approved', appointmentDate: '2026-08-30', appointmentStart: '10:00' }) // matches the faked "today"

    const client = new QueryClient()
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/calendar?view=month']}>
          <CalendarScreen />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('Wedding — Your Booking')).toBeInTheDocument()
    })
  })

  it('does not show a draft booking — it never became a real reservation', async () => {
    useAuthStore.setState({
      user: { id: 'user-1', fullName: 'Rio', email: 'r@x.com', phone: '', address: '' },
    })
    seedBooking({ sacrament: 'baptism', status: 'draft', appointmentDate: '2026-08-30' })
    // left as 'draft' — never submitted

    const client = new QueryClient()
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/calendar?view=month']}>
          <CalendarScreen />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('Sunday Mass')).toBeInTheDocument() // confirms load finished
    })
    expect(screen.queryByText('Baptism — Your Booking')).not.toBeInTheDocument()
  })
})
