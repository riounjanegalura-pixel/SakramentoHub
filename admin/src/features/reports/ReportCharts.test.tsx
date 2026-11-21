import { beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ReportsScreen } from './ReportsScreen'
import { changeText, seasonOf, seasonOfMonth, statusTotals, summaryRows, toCsv } from './reportsModel'
import * as reportsData from '../../lib/data/reports'
import * as notificationsData from '../../lib/data/notifications'
import { saveBlob } from '../../lib/download'
import { renderWithProviders } from '../../test/render'
import type { ReportSummary } from '../../lib/types'

vi.mock('../../lib/download', () => ({ saveBlob: vi.fn() }))

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver

const summary = (o: Partial<ReportSummary> = {}): ReportSummary => ({
  range: { from: '2026-10-01', to: '2026-12-31' },
  totals: { bookings: 8, completed: 3, declined: 1, cancelled: 1, online: 6, walkIn: 2, urgent: 0 },
  bySacrament: [
    { sacrament: 'baptism', name: 'Baptism', total: 5, byStatus: { completed: 2, approved: 2, submitted: 1 } },
    { sacrament: 'wedding', name: 'Wedding', total: 3, byStatus: { completed: 1, declined: 1, cancelled: 1 } },
  ],
  money: { collectedCentavos: 0, refundedCentavos: 0, refundDueCentavos: 0, overpaidCentavos: 0 },
  monthly: [
    { month: '2026-10', bookings: 2, byStatus: { completed: 1, approved: 1 }, donationsCentavos: 0, certificatesIssued: 0 },
    { month: '2026-11', bookings: 4, byStatus: { completed: 2, submitted: 1, declined: 1 }, donationsCentavos: 150000, certificatesIssued: 2 },
    { month: '2026-12', bookings: 2, byStatus: { approved: 1, cancelled: 1 }, donationsCentavos: 0, certificatesIssued: 0 },
  ],
  byWeekday: [1, 0, 2, 0, 1, 4, 0],
  donations: { totalCentavos: 150000, count: 3 },
  certificates: { issued: 2 },
  previous: { range: { from: '2026-07-01', to: '2026-09-30' }, bookings: 5, completed: 3, donationsCentavos: 150000, certificatesIssued: 0 },
  ...o,
})

describe('report model', () => {
  it('names the liturgical season of a day', () => {
    expect(seasonOf('2026-12-10')).toBe('advent')
    expect(seasonOf('2026-12-26')).toBe('christmas')
    expect(seasonOf('2026-01-03')).toBe('christmas')
    expect(seasonOf('2026-03-01')).toBe('lent')
    expect(seasonOf('2026-04-20')).toBe('easter')
    expect(seasonOf('2026-08-15')).toBe('ordinary')
    expect(seasonOfMonth('2026-11')).toBe('ordinary')
  })

  it('totals the four status bars, with returned counted as pending', () => {
    const t = statusTotals(summary({ bySacrament: [{ sacrament: 'baptism', name: 'Baptism', total: 3, byStatus: { submitted: 1, returned: 1, completed: 1 } }] }))
    expect(t.map((x) => [x.label, x.count, x.colour])).toEqual([
      ['Completed', 1, 'var(--status-done-fg)'], ['Confirmed', 0, 'var(--navy)'], ['Pending', 2, 'var(--status-pending-fg)'], ['Declined', 0, 'var(--danger)'],
    ])
  })

  it('describes change in words', () => {
    expect(changeText(5, 5)).toBe('No change')
    expect(changeText(8, 5)).toBe('Up 3 (60%)')
    expect(changeText(2, 4)).toBe('Down 2 (50%)')
    expect(changeText(3, 0)).toBe('Up 3 from none')
  })

  it('guards a CSV cell that would run as a formula and quotes commas', async () => {
    const blob = toCsv(["A", "B"], [["=1+1", "x, y"]])
    expect(new Uint8Array(await blob.arrayBuffer()).slice(0, 3)).toEqual(new Uint8Array([0xef, 0xbb, 0xbf]))
    const text = (await blob.text()).replace(/^﻿/, '')
    expect(text).toBe('A,B\r\n\'=1+1,"x, y"\r\n')
  })
})

describe('Reports charts', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.mocked(saveBlob).mockReset()
    vi.spyOn(notificationsData, 'fetchNotifications').mockResolvedValue([])
    vi.spyOn(reportsData, 'fetchReportSummary').mockResolvedValue(summary())
    vi.spyOn(reportsData, 'fetchAllBookings').mockResolvedValue({ rows: [], total: 0, truncated: false })
  })

  it('names the seasons the months fall in', async () => {
    renderWithProviders(<ReportsScreen />)
    const card = await screen.findByRole('region', { name: 'Bookings per month' })
    expect(within(card).getByRole('img', { name: /Bookings per month, 8 in total/ })).toBeInTheDocument()
    const seasons = within(card).getByRole('list', { name: 'Liturgical seasons' })
    expect(seasons).toHaveTextContent('Ordinary Time')
    expect(seasons).toHaveTextContent('Advent')
  })

  it('lists each status with its total beside the sacrament chart', async () => {
    renderWithProviders(<ReportsScreen />)
    const card = await screen.findByRole('region', { name: 'By sacrament and status' })
    expect(within(card).getByRole('list', { name: 'Statuses' })).toHaveTextContent('Completed3Confirmed2Pending1Declined1')
    await userEvent.click(within(card).getByRole('button', { name: 'Table' }))
    expect(within(card).getByRole('row', { name: /Baptism/ })).toHaveTextContent('5')
  })

  it('switches a chart to its table and downloads it as CSV', async () => {
    renderWithProviders(<ReportsScreen />)
    const card = await screen.findByRole('region', { name: 'Bookings by weekday' })
    await userEvent.click(within(card).getByRole('button', { name: 'Table' }))
    const table = within(card).getByRole('table', { name: 'Bookings by weekday as a table' })
    expect(within(table).getByRole('row', { name: /Saturday/ })).toHaveTextContent('4')
    await userEvent.click(within(card).getByRole('button', { name: 'Download bookings by weekday (CSV)' }))
    expect(saveBlob).toHaveBeenCalledWith(expect.any(Blob), 'bookings-by-weekday-2026-10-01-to-2026-12-31.csv')
  })

  it('offers a table and a download for every chart', async () => {
    renderWithProviders(<ReportsScreen />)
    await screen.findByRole('region', { name: 'Bookings per month' })
    for (const name of ['bookings per month', 'by sacrament and status', 'bookings by weekday', 'certificates issued', 'donations per month']) {
      expect(screen.getByRole('button', { name: `Download ${name} (CSV)` })).toBeInTheDocument()
    }
  })

  it('shows the gifts per month as a table in pesos and the change against the previous period', async () => {
    renderWithProviders(<ReportsScreen />)
    const gifts = await screen.findByRole('region', { name: 'Donations per month' })
    await userEvent.click(within(gifts).getByRole('button', { name: 'Table' }))
    expect(within(gifts).getByRole('row', { name: /November 2026/ })).toHaveTextContent('1500.00')
    const sum = screen.getByRole('region', { name: 'Summary' })
    expect(sum).toHaveTextContent('Up 3 (60%) on the period before')
    expect(within(sum).getByText('Certificates issued').nextElementSibling).toHaveTextContent('2')
    expect(sum).toHaveTextContent('Up 2 from none on the period before')
    expect(screen.getByRole('region', { name: 'Money' })).toHaveTextContent('No change on the period before')
  })

  it('says so when there is nothing to chart', async () => {
    vi.spyOn(reportsData, 'fetchReportSummary').mockResolvedValue(
      summary({ totals: { bookings: 0, completed: 0, declined: 0, cancelled: 0, online: 0, walkIn: 0, urgent: 0 }, donations: { totalCentavos: 0, count: 0 }, certificates: { issued: 0 } }),
    )
    renderWithProviders(<ReportsScreen />)
    await waitFor(() => expect(screen.getAllByText('No bookings in this range.').length).toBeGreaterThan(3))
    expect(screen.getByText('No gifts were paid in this range.')).toBeInTheDocument()
    expect(screen.getByText('No certificates were issued in this range.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Download/ })).toBeNull()
  })

  it('still renders when an older server sends no series', async () => {
    vi.spyOn(reportsData, 'fetchReportSummary').mockResolvedValue(summary({ monthly: undefined, byWeekday: undefined, donations: undefined, certificates: undefined, previous: undefined }))
    renderWithProviders(<ReportsScreen />)
    expect(await screen.findByRole('region', { name: 'By sacrament and status' })).toBeInTheDocument()
    expect(screen.queryByText(/on the period before/)).toBeNull()
  })
})

describe('summaryRows', () => {
  it('lays the summary and money out as Section / Measure / Value rows, money in pesos', () => {
    const rows = summaryRows({
      range: { from: '2026-11-01', to: '2026-11-30' },
      totals: { bookings: 5, completed: 2, declined: 1, cancelled: 0, online: 4, walkIn: 1, urgent: 0 },
      bySacrament: [{ sacrament: 'baptism', name: 'Baptism', total: 3, byStatus: {} }],
      money: { collectedCentavos: 150050, refundedCentavos: 0, refundDueCentavos: 5000, overpaidCentavos: 0 },
      donations: { totalCentavos: 20000, count: 1 },
      certificates: { issued: 2 },
    })
    expect(rows).toContainEqual(['Summary', 'Bookings', 5])
    expect(rows).toContainEqual(['Money (PHP)', 'Fees collected', '1500.50'])
    expect(rows).toContainEqual(['Money (PHP)', 'Gifts received', '200.00'])
    expect(rows).toContainEqual(['Bookings by sacrament', 'Baptism', 3])
  })
})
