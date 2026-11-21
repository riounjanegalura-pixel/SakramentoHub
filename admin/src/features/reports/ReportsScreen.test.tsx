import { beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ReportsScreen } from './ReportsScreen'
import * as reportsData from '../../lib/data/reports'
import * as notificationsData from '../../lib/data/notifications'
import { saveBlob } from '../../lib/download'
import { monthBounds, shiftMonth } from '../../lib/dates'
import { parishToday } from '../../lib/domain'
import { renderWithProviders } from '../../test/render'
import { expectNoA11yViolations } from '../../test/a11y'
import { adminBooking } from '../../test/factories'
import type { ReportSummary } from '../../lib/types'

vi.mock('../../lib/download', () => ({ saveBlob: vi.fn() }))

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver

const summary = (o: Partial<ReportSummary> = {}): ReportSummary => ({
  range: { from: '2026-11-01', to: '2026-11-30' },
  totals: { bookings: 12, completed: 5, declined: 1, cancelled: 2, online: 9, walkIn: 3, urgent: 1 },
  bySacrament: [
    { sacrament: 'baptism', name: 'Baptism', total: 4, byStatus: { submitted: 1, approved: 2, completed: 1 } },
    { sacrament: 'wedding', name: 'Wedding', total: 0, byStatus: {} },
  ],
  money: { collectedCentavos: 1010000, refundedCentavos: 500000, refundDueCentavos: 5000, overpaidCentavos: 10000 },
  ...o,
})

const register = (truncated = false) => ({
  rows: [
    adminBooking({
      id: 'b1', referenceNumber: 'BAPT-1', subjectName: 'José Dela Cruz', status: 'completed', paymentStatus: 'paid', channel: 'online',
      appointmentDate: '2026-11-15', appointmentStart: '10:00', appointmentEnd: '11:00', user: { fullName: 'Juana Dela Cruz', email: 'j@example.com', phone: '09171234567' },
    }),
    adminBooking({
      id: 'b2', referenceNumber: 'ANOI-2', sacrament: 'anointing', subjectName: 'Rosa Tan', status: 'submitted', isEmergency: true, channel: 'walk_in',
      paymentStatus: 'not_required', user: { fullName: 'Lola Nena', email: null, phone: '09181112222' },
    }),
  ],
  total: truncated ? 400 : 2,
  truncated,
})

describe('ReportsScreen', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.mocked(saveBlob).mockReset()
    vi.spyOn(notificationsData, 'fetchNotifications').mockResolvedValue([])
    vi.spyOn(reportsData, 'fetchReportSummary').mockResolvedValue(summary())
    vi.spyOn(reportsData, 'fetchAllBookings').mockResolvedValue(register())
  })

  it('opens on the last twelve months', async () => {
    const start = monthBounds(shiftMonth(parishToday(), -11)).start
    const { end } = monthBounds(parishToday())
    renderWithProviders(<ReportsScreen />)
    await waitFor(() => expect(reportsData.fetchReportSummary).toHaveBeenCalledWith({ from: start, to: end, sacrament: '' }))
    expect(screen.getByLabelText('From')).toHaveValue(start)
    expect(screen.getByLabelText('To')).toHaveValue(end)
  })

  it('shows the totals, the breakdown by sacrament and the money in pesos', async () => {
    renderWithProviders(<ReportsScreen />)

    const totals = await screen.findByRole('region', { name: 'Summary' })
    expect(within(totals).getByText('Bookings').nextElementSibling).toHaveTextContent('12')
    expect(within(totals).getByText('Completed').nextElementSibling).toHaveTextContent('5')
    expect(within(totals).getByText('Walk-in').nextElementSibling).toHaveTextContent('3')
    expect(within(totals).getByText('Urgent').nextElementSibling).toHaveTextContent('1')

    const bySacrament = screen.getByRole('region', { name: 'By sacrament and status' })
    await userEvent.click(within(bySacrament).getByRole('button', { name: 'Table' }))
    expect(within(bySacrament).getByRole('row', { name: /Baptism/ })).toHaveTextContent('4')

    const money = screen.getByRole('region', { name: 'Money' })
    expect(within(money).getByText('Fees collected').nextElementSibling).toHaveTextContent('₱10,100.00')
    expect(within(money).getByText('Refunded in this range').nextElementSibling).toHaveTextContent('₱5,000.00')
    expect(within(money).getByText('Refunds still due').nextElementSibling).toHaveTextContent('₱50.00')
    expect(within(money).getByText('Overpaid, to refund').nextElementSibling).toHaveTextContent('₱100.00')
  })

  it('lists every booking in the range as a register', async () => {
    renderWithProviders(<ReportsScreen />)

    const table = await screen.findByRole('table', { name: 'Bookings register' })
    const first = within(table).getByRole('row', { name: /BAPT-1/ })
    expect(first).toHaveTextContent('José Dela Cruz')
    expect(first).toHaveTextContent('09171234567')
    expect(first).toHaveTextContent('Sun, Nov 15, 2026 · 10:00 AM')
    expect(first).toHaveTextContent('Completed')
    expect(first).toHaveTextContent('Paid')
    expect(within(first).getByRole('link', { name: 'BAPT-1' })).toHaveAttribute('href', '/bookings/b1')

    const second = within(table).getByRole('row', { name: /ANOI-2/ })
    expect(second).toHaveTextContent('Urgent — no slot')
    expect(second).toHaveTextContent('Walk-in')
    expect(second).not.toHaveTextContent('null')
  })

  it('says when the register was cut short', async () => {
    vi.spyOn(reportsData, 'fetchAllBookings').mockResolvedValue(register(true))
    renderWithProviders(<ReportsScreen />)
    expect(await screen.findByText(/Showing the first 2 of 400/)).toBeInTheDocument()
  })

  it('refetches for another range and sacrament', async () => {
    renderWithProviders(<ReportsScreen />)
    await screen.findByRole('region', { name: 'Summary' })

    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-10-01' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-10-31' } })
    await userEvent.selectOptions(screen.getByLabelText('Sacrament'), 'baptism')

    await waitFor(() => expect(reportsData.fetchReportSummary).toHaveBeenLastCalledWith({ from: '2026-10-01', to: '2026-10-31', sacrament: 'baptism' }))
    expect(reportsData.fetchAllBookings).toHaveBeenLastCalledWith({ from: '2026-10-01', to: '2026-10-31', sacrament: 'baptism' })
  })

  it('refuses a range that ends before it starts, or runs over a year, without calling the server', async () => {
    renderWithProviders(<ReportsScreen />)
    await screen.findByRole('region', { name: 'Summary' })

    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-12-31' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-12-01' } })
    expect(await screen.findByText('The end date must not be before the start date.')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2024-01-01' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-12-01' } })
    expect(await screen.findByText('A report may cover at most one year.')).toBeInTheDocument()
    // Whatever intermediate (valid) ranges the typing passed through, the two invalid ones never reached the server.
    const sent = vi.mocked(reportsData.fetchReportSummary).mock.calls.map(([q]) => `${q.from}→${q.to}`)
    expect(sent).not.toContain('2026-12-31→2026-12-01')
    expect(sent).not.toContain('2024-01-01→2026-12-01')
  })

  it('exports the CSV through the authenticated client and saves it under the server file name', async () => {
    const blob = new Blob(['Reference\n'])
    const download = vi.spyOn(reportsData, 'downloadBookingsCsv').mockResolvedValue(blob)
    renderWithProviders(<ReportsScreen />)
    await screen.findByRole('region', { name: 'Summary' })
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-11-01' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-11-30' } })

    await userEvent.click(screen.getByRole('button', { name: 'Export CSV' }))

    await waitFor(() => expect(saveBlob).toHaveBeenCalledWith(blob, 'bookings-2026-11-01-to-2026-11-30.csv'))
    expect(download).toHaveBeenCalledWith({ from: '2026-11-01', to: '2026-11-30', sacrament: '' })
  })

  it('exports the designed Excel workbook and saves it under the .xlsx name', async () => {
    const blob = new Blob(['PK'])
    const download = vi.spyOn(reportsData, 'downloadBookingsXlsx').mockResolvedValue(blob)
    renderWithProviders(<ReportsScreen />)
    await screen.findByRole('region', { name: 'Summary' })
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-11-01' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-11-30' } })

    await userEvent.click(screen.getByRole('button', { name: 'Export Excel' }))

    await waitFor(() => expect(saveBlob).toHaveBeenCalledWith(blob, 'bookings-2026-11-01-to-2026-11-30.xlsx'))
    expect(download).toHaveBeenCalledWith({ from: '2026-11-01', to: '2026-11-30', sacrament: '' })
  })

  it('shows the server message when the export fails', async () => {
    vi.spyOn(reportsData, 'downloadBookingsCsv').mockRejectedValue(new Error('A report may cover at most one year.'))
    renderWithProviders(<ReportsScreen />)
    await userEvent.click(await screen.findByRole('button', { name: 'Export CSV' }))
    expect(await screen.findByText('A report may cover at most one year.')).toBeInTheDocument()
    expect(saveBlob).not.toHaveBeenCalled()
  })

  it('has no print button: the report leaves as CSV', async () => {
    renderWithProviders(<ReportsScreen />)
    await screen.findByRole('button', { name: 'Export CSV' })
    expect(screen.queryByRole('button', { name: 'Print' })).not.toBeInTheDocument()
  })

  it('shows a load error', async () => {
    vi.spyOn(reportsData, 'fetchReportSummary').mockRejectedValue(new Error('Reports are unavailable'))
    renderWithProviders(<ReportsScreen />)
    expect(await screen.findByText(/Reports are unavailable/)).toBeInTheDocument()
  })

  it('has a Reports link in the sidebar', async () => {
    renderWithProviders(<ReportsScreen />)
    expect(await screen.findByRole('link', { name: 'Reports' })).toHaveAttribute('href', '/reports')
  })

  it('has no accessibility violations', async () => {
    const { container } = renderWithProviders(<ReportsScreen />)
    await screen.findByRole('region', { name: 'Summary' })
    await expectNoA11yViolations(container, { fullPage: true })
  })

  it('links the range error to the date field and marks it invalid', async () => {
    renderWithProviders(<ReportsScreen />)
    await screen.findByRole('region', { name: 'Summary' })
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-12-31' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-12-01' } })
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('The end date must not be before the start date.')
    const to = screen.getByLabelText('To')
    expect(to).toHaveAttribute('aria-invalid', 'true')
    expect(to.getAttribute('aria-describedby')).toContain(alert.id)
  })

  it('shows a busy skeleton while loading', async () => {
    vi.spyOn(reportsData, 'fetchReportSummary').mockReturnValue(new Promise(() => {}))
    renderWithProviders(<ReportsScreen />)
    const label = await screen.findByText('Loading the report')
    expect(label).toHaveClass('sr-only')
    expect(label.closest('[aria-busy="true"]')).not.toBeNull()
  })

  it('offers a retry for the summary and for the register', async () => {
    const sum = vi.spyOn(reportsData, 'fetchReportSummary').mockRejectedValueOnce(new Error('Reports are unavailable')).mockResolvedValue(summary())
    const reg = vi.spyOn(reportsData, 'fetchAllBookings').mockRejectedValueOnce(new Error('Register is unavailable')).mockResolvedValue(register())
    renderWithProviders(<ReportsScreen />)
    expect(await screen.findByText(/Reports are unavailable/)).toBeInTheDocument()
    expect(await screen.findByText(/Register is unavailable/)).toBeInTheDocument()
    const buttons = screen.getAllByRole('button', { name: 'Try again' })
    expect(buttons).toHaveLength(2)
    for (const b of buttons) await userEvent.click(b)
    expect(await screen.findByRole('region', { name: 'Summary' })).toBeInTheDocument()
    expect(await screen.findByRole('table', { name: 'Bookings register' })).toBeInTheDocument()
    expect(sum).toHaveBeenCalledTimes(2)
    expect(reg).toHaveBeenCalledTimes(2)
  })

  it('says when no bookings fall in the range', async () => {
    vi.spyOn(reportsData, 'fetchAllBookings').mockResolvedValue({ rows: [], total: 0, truncated: false })
    renderWithProviders(<ReportsScreen />)
    expect(await screen.findByText('No bookings in this range.')).toBeInTheDocument()
  })

  it('shows ten register rows a page and hides the pager when one page is enough', async () => {
    renderWithProviders(<ReportsScreen />)
    await screen.findByRole('table', { name: 'Bookings register' })
    expect(screen.queryByRole('button', { name: 'Next page' })).toBeNull()

    const rows = Array.from({ length: 12 }, (_, i) => adminBooking({ id: `r${i}`, referenceNumber: `BAPT-${i}` }))
    vi.spyOn(reportsData, 'fetchAllBookings').mockResolvedValue({ rows, total: 12, truncated: false })
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-10-01' } })
    const table = await screen.findByRole('table', { name: 'Bookings register' })
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(11)) // header + 10
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }))
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(3)) // header + 2
  })
})
