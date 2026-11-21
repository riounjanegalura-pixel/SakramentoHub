import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CertificateRequestsScreen } from './CertificateRequestsScreen'
import * as data from '../../lib/data/certificateRequests'
import * as notificationsData from '../../lib/data/notifications'
import { LocationProbe, renderWithProviders } from '../../test/render'
import { certificateRequest, paginated } from '../../test/factories'
import { expectNoA11yViolations } from '../../test/a11y'

const rows = [
  certificateRequest(),
  certificateRequest({ id: 'c2', referenceNumber: 'CERT-20261001-ZZ99', sacrament: 'wedding', personName: 'Ana Reyes', requester: { fullName: 'Rosa Reyes', email: null, phone: null }, status: 'issued' }),
]

function renderScreen(route = '/certificate-requests') {
  return renderWithProviders(<><CertificateRequestsScreen /><LocationProbe /></>, { route })
}

/** A row is found by its reference link (rows are not buttons). */
async function findRow(reference: string): Promise<HTMLElement> {
  return (await screen.findByRole('link', { name: reference })).closest('tr') as HTMLElement
}

describe('CertificateRequestsScreen', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(notificationsData, 'fetchNotifications').mockResolvedValue([])
    vi.spyOn(data, 'fetchCertificateRequests').mockResolvedValue(paginated(rows))
  })

  it('lists reference, certificate, name on record, requester, submitted date and status', async () => {
    renderScreen()
    const row1 = within(await findRow('CERT-20261005-AB12'))
    expect(row1.getByText('Baptism')).toBeInTheDocument()
    expect(row1.getAllByText('Pedro Santos')).toHaveLength(2) // name on record and requester
    expect(row1.getByText(/Oct 5, 2026/)).toBeInTheDocument()
    expect(row1.getByText('Waiting')).toBeInTheDocument()
    const row2 = within(await findRow('CERT-20261001-ZZ99'))
    expect(row2.getByText('Marriage')).toBeInTheDocument()
    expect(row2.getByText('Ana Reyes')).toBeInTheDocument()
    expect(row2.getByText('Rosa Reyes')).toBeInTheDocument()
    expect(row2.getByText('Issued')).toBeInTheDocument()
  })

  it('asks for the open requests by default and shows that filter', async () => {
    const spy = vi.spyOn(data, 'fetchCertificateRequests').mockResolvedValue(paginated(rows))
    renderScreen()
    await waitFor(() => expect(spy).toHaveBeenCalled())
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'submitted', page: 1 }))
    expect(within(screen.getByRole('tablist', { name: 'Filter by status' })).getByRole('tab', { name: /^Waiting/ })).toHaveAttribute('aria-selected', 'true')
  })

  it('sends the chosen status in the URL, and All sends no status', async () => {
    const spy = vi.spyOn(data, 'fetchCertificateRequests').mockResolvedValue(paginated(rows))
    renderScreen()
    await screen.findByText('Ana Reyes')

    await userEvent.click(within(screen.getByRole('tablist', { name: 'Filter by status' })).getByRole('tab', { name: /^Declined/ }))
    await waitFor(() => expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'declined' })))
    expect(screen.getByTestId('location')).toHaveTextContent('status=declined')

    await userEvent.click(within(screen.getByRole('tablist', { name: 'Filter by status' })).getByRole('tab', { name: /^All/ }))
    await waitFor(() => expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ status: '' })))
    expect(screen.getByTestId('location')).toHaveTextContent('status=all')
  })

  it('opens from a link with the status in the address', async () => {
    const spy = vi.spyOn(data, 'fetchCertificateRequests').mockResolvedValue(paginated(rows))
    renderScreen('/certificate-requests?status=cancelled')
    await waitFor(() => expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'cancelled' })))
  })

  it('sends the search once typing pauses', async () => {
    const spy = vi.spyOn(data, 'fetchCertificateRequests').mockResolvedValue(paginated(rows))
    renderScreen()
    await screen.findByText('Ana Reyes')
    await userEvent.type(screen.getByLabelText('Search requests'), 'santos')
    await waitFor(() => expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'santos', page: 1 })))
  })

  it('pages through the list', async () => {
    const spy = vi.spyOn(data, 'fetchCertificateRequests').mockResolvedValue({
      ...paginated(rows),
      meta: { current_page: 1, last_page: 3, per_page: 15, total: 40 },
    })
    renderScreen()
    await screen.findByText('Ana Reyes')
    await userEvent.click(screen.getByRole('button', { name: /next/i }))
    await waitFor(() => expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 })))
  })

  it('opens a request when its row is clicked', async () => {
    renderScreen()
    await userEvent.click(await findRow('CERT-20261001-ZZ99'))
    expect(screen.getByTestId('location')).toHaveTextContent('/certificate-requests/c2')
  })

  it('opens a request with Enter on its reference, and no row is a bare focus stop', async () => {
    renderScreen()
    const link = await screen.findByRole('link', { name: 'CERT-20261001-ZZ99' })
    expect(screen.getAllByRole('row').some((r) => r.hasAttribute('tabindex') || r.getAttribute('role') === 'button')).toBe(false)
    link.focus()
    await userEvent.keyboard('{Enter}')
    expect(screen.getByTestId('location')).toHaveTextContent('/certificate-requests/c2')
  })

  it('is a captioned, sortable table with no axe violations', async () => {
    const { container } = renderScreen()
    await findRow('CERT-20261001-ZZ99')
    const table = screen.getByRole('table', { name: 'Certificate requests' })
    const header = within(table).getByRole('columnheader', { name: 'Submitted' })
    await userEvent.click(within(header).getByRole('button'))
    expect(header).toHaveAttribute('aria-sort', 'ascending')
    await expectNoA11yViolations(container)
  })

  it('says so when there are none', async () => {
    vi.spyOn(data, 'fetchCertificateRequests').mockResolvedValue(paginated([]))
    renderScreen()
    expect(await screen.findByText('No requests waiting')).toBeInTheDocument()
  })

  describe('on a phone', () => {
    beforeEach(() => {
      vi.stubGlobal('matchMedia', (query: string) => ({ matches: true, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    })
    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('lists requests as cards that link to the request', async () => {
      renderScreen()
      const list = await screen.findByRole('list', { name: 'Certificate requests' })
      const card = within(list).getByRole('link', { name: /Ana Reyes/ })
      expect(card).toHaveAttribute('href', '/certificate-requests/c2')
      expect(within(card).getByText('Issued')).toBeInTheDocument()
      expect(within(card).getByText(/Requested by Rosa Reyes/)).toBeInTheDocument()
      expect(screen.queryByRole('table')).not.toBeInTheDocument()
    })

    it('says so when there are none', async () => {
      vi.spyOn(data, 'fetchCertificateRequests').mockResolvedValue(paginated([]))
      renderScreen()
      expect(await screen.findByText('No requests waiting')).toBeInTheDocument()
    })

    it('shows a loading state, then the error with a retry', async () => {
      vi.spyOn(data, 'fetchCertificateRequests').mockRejectedValue(new Error('Boom'))
      renderScreen()
      expect(await screen.findByRole('alert')).toHaveTextContent("Requests didn't load")
      expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    })
  })

  it('shows the server error', async () => {
    vi.spyOn(data, 'fetchCertificateRequests').mockRejectedValue(new Error('Boom'))
    renderScreen()
    expect(await screen.findByRole('alert')).toHaveTextContent("Requests didn't load")
    expect(screen.getByText('Boom')).toBeInTheDocument()
  })
})
