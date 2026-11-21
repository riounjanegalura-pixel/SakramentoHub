import { apiFetch, apiFetchBlob } from './client'
import { fetchBookings, type BookingsQuery } from './bookings'
import type { AdminBooking, ReportQuery, ReportSummary } from '../types'

function toQueryString(q: ReportQuery): string {
  const params = new URLSearchParams({ from: q.from, to: q.to })
  if (q.sacrament) params.set('sacrament', q.sacrament)
  return params.toString()
}

export async function fetchReportSummary(q: ReportQuery): Promise<ReportSummary> {
  return apiFetch<ReportSummary>(`/admin/reports/summary?${toQueryString(q)}`)
}

/** The register as a CSV file. Staff-only and audited server-side (`report.exported`). */
export async function downloadBookingsCsv(q: ReportQuery): Promise<Blob> {
  return apiFetchBlob(`/admin/reports/bookings.csv?${toQueryString(q)}`)
}

/** The same report as a designed Excel workbook: a Summary sheet and a Register sheet. Audited like the CSV. */
export async function downloadBookingsXlsx(q: ReportQuery): Promise<Blob> {
  return apiFetchBlob(`/admin/reports/bookings.xlsx?${toQueryString(q)}`)
}

export function xlsxFileName(q: Pick<ReportQuery, 'from' | 'to'>): string {
  return `bookings-${q.from}-to-${q.to}.xlsx`
}

/** Same name the server puts in Content-Disposition. */
export function csvFileName(q: Pick<ReportQuery, 'from' | 'to'>): string {
  return `bookings-${q.from}-to-${q.to}.csv`
}

/** The register list: every booking in a range, by walking the paginated queue endpoint
 * at 100 rows a page (lead amendment L1; there is no separate JSON "all rows" route).
 * `maxPages` caps the walk; `truncated` tells the screen to point at the CSV export. */
export async function fetchAllBookings(
  query: BookingsQuery,
  maxPages = 10,
): Promise<{ rows: AdminBooking[]; total: number; truncated: boolean }> {
  const rows: AdminBooking[] = []
  let page = 1
  let lastPage = 1
  let total = 0
  do {
    const result = await fetchBookings({ ...query, perPage: 100, page })
    rows.push(...result.data)
    lastPage = result.meta.last_page
    total = result.meta.total
    page += 1
  } while (page <= lastPage && page <= maxPages)

  return { rows, total, truncated: lastPage > maxPages }
}
