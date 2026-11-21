import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expectNoA11yViolations } from '../../test/a11y'
import { MemoryRouter } from 'react-router-dom'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom'
import { AuditLogScreen } from './AuditLogScreen'
import * as auditLogData from '../../lib/data/audit-log'
import type { AuditLogEntry, Paginated } from '../../lib/types'

const entry = (o: Partial<AuditLogEntry> = {}): AuditLogEntry => ({
  id: 'log-1', action: 'booking.approved', subjectType: 'booking', subjectId: 'b-1', metadata: {},
  actor: { id: 'a-1', fullName: 'Admin One', email: 'admin@x.com' }, createdAt: '2026-01-05T10:00:00Z', ...o,
})

function makePage(data: AuditLogEntry[]): Paginated<AuditLogEntry> {
  return {
    data,
    links: { first: null, last: null, prev: null, next: null },
    meta: { current_page: 1, last_page: 1, per_page: 20, total: data.length },
  }
}

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AuditLogScreen />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('AuditLogScreen', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders audit log entries', async () => {
    vi.spyOn(auditLogData, 'fetchAuditLog').mockResolvedValue(
      makePage([
        {
          id: 'log-1',
          action: 'booking.approved',
          subjectType: 'booking',
          subjectId: 'b-1',
          metadata: { from: 'submitted', to: 'approved', reference: 'SH-2026-0042' },
          actor: { id: 'a-1', fullName: 'Admin One', email: 'admin@x.com' },
          createdAt: '2026-01-05T10:00:00Z',
        },
      ]),
    )
    renderScreen()

    await waitFor(() => {
      expect(screen.getByText('Admin One')).toBeInTheDocument()
    })
    expect(screen.getByText('approved a booking')).toBeInTheDocument()
    expect(screen.getByText('SH-2026-0042')).toBeInTheDocument()
    // The raw action code and database id stay off the page; they live in the hover text.
    expect(screen.queryByText('booking.approved')).not.toBeInTheDocument()
    expect(screen.queryByText(/b-1/)).not.toBeInTheDocument()
    expect(screen.getByText('approved a booking').closest('li')).toHaveAttribute('title', 'booking.approved · booking b-1')
  })

  it('surfaces a real API error', async () => {
    vi.spyOn(auditLogData, 'fetchAuditLog').mockRejectedValue(new Error('Server exploded'))
    renderScreen()

    await waitFor(() => {
      expect(screen.getByText(/Server exploded/)).toBeInTheDocument()
    })
  })

  it('shows an empty state when there are no entries', async () => {
    vi.spyOn(auditLogData, 'fetchAuditLog').mockResolvedValue(makePage([]))
    renderScreen()

    await waitFor(() => {
      expect(screen.getByText('No audit log entries yet.')).toBeInTheDocument()
    })
  })

  it('is a feed grouped by day: a named section, the time in tabular figures, no accessibility violations', async () => {
    vi.spyOn(auditLogData, 'fetchAuditLog').mockResolvedValue(makePage([entry()]))
    const { container } = renderScreen()
    await screen.findByText('Admin One')
    const feed = screen.getByRole('region', { name: 'Audit log' })
    expect(within(feed).getByRole('heading', { level: 2, name: /January 5/ })).toBeInTheDocument()
    expect(within(feed).getByText(/\d:\d\d/)).toHaveClass('tabular-nums')
    expect(within(feed).queryByText('booking.approved')).not.toBeInTheDocument()
    expect(within(feed).getByText('approved a booking')).toBeInTheDocument()
    await expectNoA11yViolations(container, { fullPage: true })
  })

  it('shows a plain sentence, and falls back to the code alone for an unknown action', async () => {
    vi.spyOn(auditLogData, 'fetchAuditLog').mockResolvedValue(makePage([entry(), entry({ id: 'log-2', action: 'mystery.thing' })]))
    renderScreen()
    await screen.findByText('approved a booking')
    expect(screen.queryByText('booking.approved')).not.toBeInTheDocument()
    expect(screen.getAllByText('mystery.thing')).toHaveLength(1)
  })

  it('sends area, search and the chosen range to the server and resets to page 1', async () => {
    const spy = vi.spyOn(auditLogData, 'fetchAuditLog').mockResolvedValue(makePage([entry()]))
    renderScreen()
    await screen.findByText('Admin One')
    // The page opens on the last 14 days.
    expect(spy).toHaveBeenLastCalledWith(1, { area: undefined, q: undefined, from: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) })
    await userEvent.click(within(screen.getByRole('radiogroup', { name: 'Area' })).getByRole('radio', { name: 'Register' }))
    await waitFor(() => expect(spy).toHaveBeenLastCalledWith(1, { area: 'register', q: undefined, from: expect.any(String) }))
    await userEvent.type(screen.getByLabelText('Search the log'), 'staff')
    await waitFor(() => expect(spy).toHaveBeenLastCalledWith(1, { area: 'register', q: 'staff', from: expect.any(String) }))
    await userEvent.selectOptions(screen.getByLabelText('Show'), 'All time')
    await waitFor(() => expect(spy).toHaveBeenLastCalledWith(1, { area: 'register', q: 'staff', from: undefined }))
  })

  it('says so when the filters match nothing, and clears them', async () => {
    const spy = vi.spyOn(auditLogData, 'fetchAuditLog').mockResolvedValue(makePage([]))
    renderScreen()
    await screen.findByText('No audit log entries yet.')
    await userEvent.click(within(screen.getByRole('radiogroup', { name: 'Area' })).getByRole('radio', { name: 'Users' }))
    expect(await screen.findByText('Nothing matches')).toBeInTheDocument()
    expect(screen.getByText('Try another name, record or area.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(await screen.findByText('No audit log entries yet.')).toBeInTheDocument()
    expect(spy).toHaveBeenLastCalledWith(1, { area: undefined, q: undefined, from: expect.any(String) })
  })

  it('offers the last 7 days, 30 days and all time, each as a start date', async () => {
    const spy = vi.spyOn(auditLogData, 'fetchAuditLog').mockResolvedValue(makePage([entry()]))
    renderScreen()
    await screen.findByText('Admin One')
    const show = screen.getByLabelText('Show')
    expect(within(show).getAllByRole('option').map((o) => o.textContent)).toEqual(['Last 14 days', 'Last 7 days', 'Last 30 days', 'All time'])
    await userEvent.selectOptions(show, 'Last 7 days')
    await waitFor(() => expect(spy).toHaveBeenLastCalledWith(1, expect.objectContaining({ from: expect.any(String) })))
  })

  it('shows an error with retry and a busy placeholder while loading', async () => {
    const spy = vi.spyOn(auditLogData, 'fetchAuditLog').mockRejectedValueOnce(new Error('Server exploded')).mockResolvedValue(makePage([]))
    renderScreen()
    expect(await screen.findByText(/Server exploded/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('No audit log entries yet.')).toBeInTheDocument()
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('shows 10 a page, takes them from the server pages of 20, and hides the pager when one page is enough', async () => {
    const many = Array.from({ length: 20 }, (_, i) => entry({ id: `log-${i}`, subjectId: `b-${i}` }))
    const spy = vi.spyOn(auditLogData, 'fetchAuditLog').mockResolvedValue({ ...makePage(many), meta: { current_page: 1, last_page: 3, per_page: 20, total: 50 } })
    renderScreen()
    await screen.findAllByText('Admin One')
    expect(screen.getAllByRole('listitem')).toHaveLength(10)
    expect(screen.getByText('Showing 1 to 10 of 50')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }))
    await screen.findByText('Showing 11 to 20 of 50')
    expect(spy).not.toHaveBeenCalledWith(2, expect.anything()) // rows 11 to 20 are in server page 1
  })

  it('hides the pager when everything fits on one page', async () => {
    vi.spyOn(auditLogData, 'fetchAuditLog').mockResolvedValue(makePage([entry()]))
    renderScreen()
    await screen.findByText('Admin One')
    expect(screen.queryByRole('navigation', { name: 'Pages' })).not.toBeInTheDocument()
  })

  it('shows a busy skeleton while loading', async () => {
    vi.spyOn(auditLogData, 'fetchAuditLog').mockReturnValue(new Promise(() => {}))
    renderScreen()
    expect(await screen.findByText('Loading the audit log')).toHaveClass('sr-only')
  })
})
