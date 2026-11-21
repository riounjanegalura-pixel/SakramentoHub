import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as bookings from './bookings'
import * as schedule from './schedule'
import * as settings from './settings'
import * as reports from './reports'
import * as notifications from './notifications'

const fetchMock = vi.fn()

function respond(body: unknown = {}, status = 200) {
  fetchMock.mockImplementation(() =>
    Promise.resolve(
      status === 204
        ? new Response(null, { status })
        : new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
    ),
  )
}

function last() {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit | undefined]
  return {
    url: url.replace('http://api.test/api', ''),
    method: init?.method ?? 'GET',
    body: init?.body ? JSON.parse(String(init.body)) : undefined,
  }
}

beforeEach(() => {
  vi.stubEnv('VITE_API_URL', 'http://api.test/api')
  fetchMock.mockReset()
  respond()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

type Row = [name: string, call: () => Promise<unknown>, method: string, url: string, body: unknown]

const rows: Row[] = [
  ['reviewDocument accepted', () => bookings.reviewDocument('b1', 'deathCertificate', 'accepted'), 'PUT', '/admin/bookings/b1/documents/deathCertificate', { status: 'accepted' }],
  ['reviewDocument rejected', () => bookings.reviewDocument('b1', 'deathCertificate', 'rejected', 'Blurry'), 'PUT', '/admin/bookings/b1/documents/deathCertificate', { status: 'rejected', note: 'Blurry' }],
  ['returnBooking with a note', () => bookings.returnBooking('b1', ' Fix the address '), 'PATCH', '/admin/bookings/b1/return', { note: 'Fix the address' }],
  ['returnBooking without a note', () => bookings.returnBooking('b1'), 'PATCH', '/admin/bookings/b1/return', {}],
  ['rescheduleBooking', () => bookings.rescheduleBooking('b1', { appointmentDate: '2026-11-12', appointmentStart: '14:00', reason: 'Family asked', waiveLeadTime: true }), 'PATCH', '/admin/bookings/b1/reschedule', { appointmentDate: '2026-11-12', appointmentStart: '14:00', reason: 'Family asked', waiveLeadTime: true }],
  ['recordPartialRefund', () => bookings.recordPartialRefund('b1', 'PM-1', 5000), 'PATCH', '/admin/bookings/b1/partial-refund', { reference: 'PM-1', amountCentavos: 5000 }],
  ['createPaymentLink', () => bookings.createPaymentLink('b1'), 'POST', '/admin/bookings/b1/payment', undefined],
  ['fetchBookingNotes', () => bookings.fetchBookingNotes('b1'), 'GET', '/admin/bookings/b1/notes', undefined],
  ['addBookingNote', () => bookings.addBookingNote('b1', 'Called the family'), 'POST', '/admin/bookings/b1/notes', { body: 'Called the family' }],
  ['fetchBookingHistory', () => bookings.fetchBookingHistory('b1'), 'GET', '/admin/bookings/b1/history', undefined],
  ['fetchSchedule', () => schedule.fetchSchedule('2026-11-01', '2026-11-30'), 'GET', '/admin/schedule?start=2026-11-01&end=2026-11-30', undefined],
  ['fetchAvailability', () => schedule.fetchAvailability('baptism', '2026-11-15', { scheduleType: 'regular', excludeBookingId: 'b1', waiveLeadTime: true }), 'GET', '/services/baptism/availability?date=2026-11-15&scheduleType=regular&excludeBookingId=b1&waiveLeadTime=1', undefined],
  ['fetchAvailability without options', () => schedule.fetchAvailability('funeral', '2026-11-15'), 'GET', '/services/funeral/availability?date=2026-11-15', undefined],
  ['fetchSettings', () => settings.fetchSettings(), 'GET', '/admin/settings', undefined],
  ['updateParishSettings', () => settings.updateParishSettings({ priestName: 'Rev. Fr. New' }), 'PATCH', '/admin/settings/parish', { priestName: 'Rev. Fr. New' }],
  ['updateServiceSettings', () => settings.updateServiceSettings('wedding', { priceCentavos: 800000 }), 'PATCH', '/admin/settings/services/wedding', { priceCentavos: 800000 }],
  ['fetchBlackouts', () => settings.fetchBlackouts(), 'GET', '/admin/blackouts', undefined],
  ['createBlackouts', () => settings.createBlackouts({ date: '2026-11-10', endDate: '2026-11-11', reason: 'Parish fiesta', sacraments: ['funeral'] }), 'POST', '/admin/blackouts', { date: '2026-11-10', endDate: '2026-11-11', reason: 'Parish fiesta', sacraments: ['funeral'] }],
  ['deleteBlackout', () => settings.deleteBlackout(7), 'DELETE', '/admin/blackouts/7', undefined],
  ['fetchReportSummary', () => reports.fetchReportSummary({ from: '2026-11-01', to: '2026-11-30', sacrament: 'baptism' }), 'GET', '/admin/reports/summary?from=2026-11-01&to=2026-11-30&sacrament=baptism', undefined],
  ['fetchReportSummary without a sacrament', () => reports.fetchReportSummary({ from: '2026-11-01', to: '2026-11-30', sacrament: '' }), 'GET', '/admin/reports/summary?from=2026-11-01&to=2026-11-30', undefined],
  ['fetchNotifications', () => notifications.fetchNotifications(), 'GET', '/notifications', undefined],
  ['markNotificationRead', () => notifications.markNotificationRead('n1'), 'POST', '/notifications/n1/read', undefined],
  ['markAllNotificationsRead', () => notifications.markAllNotificationsRead(), 'POST', '/notifications/mark-all-read', undefined],
]

describe('Office operations admin endpoints', () => {
  it.each(rows)('%s', async (_name, call, method, url, body) => {
    await call()
    expect(last()).toEqual({ url, method, body })
  })

  it('sends the new queue filters, and only sends from/to together', async () => {
    await bookings.fetchBookings({ status: 'submitted', paymentStatus: 'refund_due', channel: 'walk_in', from: '2026-11-01', to: '2026-11-30', attention: 'overpaid', page: 2 })
    expect(last().url).toBe('/admin/bookings?status=submitted&paymentStatus=refund_due&channel=walk_in&from=2026-11-01&to=2026-11-30&attention=overpaid&page=2')

    await bookings.fetchBookings({ from: '2026-11-01' })
    expect(last().url).toBe('/admin/bookings')

    await bookings.fetchBookingCounts({ status: 'submitted', search: 'cruz', channel: 'online', paymentStatus: 'paid', from: '2026-11-01', to: '2026-11-30', attention: 'overpaid' })
    expect(last().url).toBe('/admin/bookings/counts?status=submitted&paymentStatus=paid&channel=online&search=cruz&from=2026-11-01&to=2026-11-30&attention=overpaid')
  })

  it('downloads the CSV as a blob through the authenticated client', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response('Reference\n', { status: 200 })))
    const blob = await reports.downloadBookingsCsv({ from: '2026-11-01', to: '2026-11-30', sacrament: '' })
    expect(last().url).toBe('/admin/reports/bookings.csv?from=2026-11-01&to=2026-11-30')
    expect(await blob.text()).toBe('Reference\n')
    expect(reports.csvFileName({ from: '2026-11-01', to: '2026-11-30' })).toBe('bookings-2026-11-01-to-2026-11-30.csv')
  })

  it('fetchAllBookings walks every page and flags a truncated list', async () => {
    const page = (n: number, last: number) => ({ data: [{ id: `b${n}` }], links: {}, meta: { current_page: n, last_page: last, per_page: 1, total: last } })
    fetchMock.mockImplementation((url: string) => {
      const n = Number(new URL(url).searchParams.get('page') ?? 1)
      return Promise.resolve(new Response(JSON.stringify(page(n, 3)), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    })
    const all = await reports.fetchAllBookings({ from: '2026-11-01', to: '2026-11-30' })
    expect(all.rows.map((b) => b.id)).toEqual(['b1', 'b2', 'b3'])
    expect(all).toMatchObject({ total: 3, truncated: false })
    expect(new URL(fetchMock.mock.calls[0][0] as string).searchParams.get('perPage')).toBe('100')

    const capped = await reports.fetchAllBookings({ from: '2026-11-01', to: '2026-11-30' }, 2)
    expect(capped.rows).toHaveLength(2)
    expect(capped.truncated).toBe(true)
  })

  it('defaults to a ten page cap', async () => {
    const page = (n: number) => ({ data: [{ id: `b${n}` }], links: {}, meta: { current_page: n, last_page: 12, per_page: 100, total: 1200 } })
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(new Response(JSON.stringify(page(Number(new URL(url).searchParams.get('page') ?? 1))), { status: 200, headers: { 'Content-Type': 'application/json' } })),
    )
    const all = await reports.fetchAllBookings({ from: '2026-11-01', to: '2026-11-30' })
    expect(all.rows).toHaveLength(10)
    expect(all.truncated).toBe(true)
  })

  it('surfaces the server message on a 422', async () => {
    respond({ message: 'Review every uploaded document before approving.' }, 422)
    await expect(bookings.approveBooking('b1')).rejects.toThrow('Review every uploaded document before approving.')
  })
})
