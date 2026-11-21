import type { BookingStatus, ReportSummary } from '../../lib/types'

export type Season = 'advent' | 'christmas' | 'lent' | 'easter' | 'ordinary'

export const SEASON_LABEL: Record<Season, string> = {
  advent: 'Advent',
  christmas: 'Christmas',
  lent: 'Lent',
  easter: 'Easter',
  ordinary: 'Ordinary Time',
}

/** Band tints, mixed from the colour tokens: navy-violet for Advent and Lent, gold for Christmas and Easter, green for Ordinary Time. */
export const SEASON_BAND: Record<Season, string> = {
  advent: 'color-mix(in srgb, var(--navy) 9%, var(--surface))',
  lent: 'color-mix(in srgb, var(--navy) 9%, var(--surface))',
  christmas: 'color-mix(in srgb, var(--gold) 24%, var(--surface))',
  easter: 'color-mix(in srgb, var(--gold) 24%, var(--surface))',
  ordinary: 'color-mix(in srgb, var(--status-done-fg) 10%, var(--surface))',
}

/** The four status bars and their colours. Pending also holds returned requests; cancelled is not charted. */
export const STATUS_BARS: { id: string; label: string; colour: string; statuses: BookingStatus[] }[] = [
  { id: 'completed', label: 'Completed', colour: 'var(--status-done-fg)', statuses: ['completed'] },
  { id: 'confirmed', label: 'Confirmed', colour: 'var(--navy)', statuses: ['approved'] },
  { id: 'pending', label: 'Pending', colour: 'var(--status-pending-fg)', statuses: ['submitted', 'returned'] },
  { id: 'declined', label: 'Declined', colour: 'var(--danger)', statuses: ['declined'] },
]

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** Easter Sunday (Gregorian), as a UTC day number. */
function easterDay(year: number): number {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return Date.UTC(year, month - 1, day) / 86_400_000
}

/** The season a calendar day falls in. */
export function seasonOf(isoDate: string): Season {
  const [y, mo, d] = isoDate.split('-').map(Number)
  const day = Date.UTC(y, mo - 1, d) / 86_400_000
  const easter = easterDay(y)
  if (day >= easter - 46 && day < easter) return 'lent'
  if (day >= easter && day <= easter + 49) return 'easter'
  // First Sunday of Advent: the Sunday from 27 November to 3 December.
  const nov27 = Date.UTC(y, 10, 27) / 86_400_000
  const weekday = new Date(nov27 * 86_400_000).getUTCDay()
  const advent = nov27 + ((7 - weekday) % 7)
  if (day >= advent && day < Date.UTC(y, 11, 25) / 86_400_000) return 'advent'
  if (day >= Date.UTC(y, 11, 25) / 86_400_000) return 'christmas'
  if (mo === 1 && d <= 12) return 'christmas' // up to about the Baptism of the Lord
  return 'ordinary'
}

/** A month is shown in the season its middle falls in. */
export function seasonOfMonth(month: string): Season {
  return seasonOf(`${month}-15`)
}

export function monthName(month: string, short = false): string {
  const [y, m] = month.split('-').map(Number)
  const name = MONTHS[m - 1]
  return short ? `${name.slice(0, 3)} ${String(y).slice(2)}` : `${name} ${y}`
}

export function statusTotals(summary: ReportSummary): { id: string; label: string; colour: string; count: number }[] {
  const per: Partial<Record<BookingStatus, number>> = {}
  for (const row of summary.bySacrament) {
    for (const [status, n] of Object.entries(row.byStatus) as [BookingStatus, number][]) per[status] = (per[status] ?? 0) + n
  }
  return STATUS_BARS.map((s) => ({ id: s.id, label: s.label, colour: s.colour, count: s.statuses.reduce((sum, st) => sum + (per[st] ?? 0), 0) }))
}

/** The change against the previous period, in words that do not rely on colour. */
export function changeText(now: number, before: number): string {
  const diff = now - before
  if (diff === 0) return 'No change'
  if (before === 0) return `Up ${diff} from none`
  const pct = Math.round((Math.abs(diff) / before) * 100)
  return `${diff > 0 ? 'Up' : 'Down'} ${Math.abs(diff)} (${pct}%)`
}

function cell(value: string | number): string {
  const text = String(value)
  const safe = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

/** A small chart as CSV text, with the byte-order mark so Excel reads it. */
export function toCsv(header: string[], rows: (string | number)[][]): Blob {
  const text = [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n'
  return new Blob(['﻿', text], { type: 'text/csv;charset=utf-8' })
}

/** The Summary and Money panels as one CSV: a Section / Measure / Value table, money in pesos with no symbol, so it sorts and sums in a spreadsheet. */
export function summaryRows(s: ReportSummary): (string | number)[][] {
  const pesos = (centavos: number) => (centavos / 100).toFixed(2)
  const rows: (string | number)[][] = [
    ['Period', 'From', s.range.from],
    ['Period', 'To', s.range.to],
    ['Summary', 'Bookings', s.totals.bookings],
    ['Summary', 'Completed', s.totals.completed],
    ['Summary', 'Certificates issued', s.certificates?.issued ?? 0],
    ['Summary', 'Declined', s.totals.declined],
    ['Summary', 'Cancelled', s.totals.cancelled],
    ['Summary', 'Online', s.totals.online],
    ['Summary', 'Walk-in', s.totals.walkIn],
    ['Summary', 'Urgent', s.totals.urgent],
    ['Money (PHP)', 'Fees collected', pesos(s.money.collectedCentavos)],
    ['Money (PHP)', 'Refunded in this range', pesos(s.money.refundedCentavos)],
    ['Money (PHP)', 'Refunds still due', pesos(s.money.refundDueCentavos)],
    ['Money (PHP)', 'Overpaid, to refund', pesos(s.money.overpaidCentavos)],
    ['Money (PHP)', 'Gifts received', pesos(s.donations?.totalCentavos ?? 0)],
  ]
  for (const row of s.bySacrament) rows.push(['Bookings by sacrament', row.name, row.total])
  return rows
}
