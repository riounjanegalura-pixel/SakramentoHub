import { SACRAMENT_LABEL } from '../../lib/constants'
import { addDays } from '../../lib/dates'
import { formatTime } from '../../lib/domain'
import type { AttentionCounts, ScheduleBookingItem, ScheduleDay, ScheduleItem, WaitingPreviewItem } from '../../lib/types'
import { buildAgenda, toMinutes, type AgendaEntry } from '../schedule/agenda'

/** The day ribbon runs 6 AM to 6 PM. */
export const RIBBON_START = 6 * 60
export const RIBBON_SPAN = 12 * 60

/** Where `hhmm` sits on the ribbon, as a percentage of its width, kept inside the ribbon. */
export function ribbonPct(hhmm: string): number {
  const pct = ((toMinutes(hhmm) - RIBBON_START) / RIBBON_SPAN) * 100
  return Math.min(100, Math.max(0, pct))
}

/** Minutes since midnight in the parish's time zone. */
export function parishNowMinutes(now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0)
  return get('hour') * 60 + get('minute')
}

export type VisitState = 'done' | 'next' | 'later'

export interface VisitRow {
  key: string
  item: ScheduleBookingItem
  /** Display name for the ribbon block: the first word of the person's name. */
  first: string
  state: VisitState
  pill: { text: string; tone: 'done' | 'next' | 'pending' } | null
  /** "Baptism" or "Funeral Mass, off-site · leave by 9:30 AM". */
  sub: string
  /** Travel before this visit, if it is off-site. */
  travelBefore: Extract<AgendaEntry, { kind: 'travel' }> | null
}

export interface OtherRow {
  key: string
  title: string
  start: string
  end: string
  sub: string
}

export interface DayModel {
  /** Everything in time order, for the list. */
  rows: Array<{ kind: 'visit'; row: VisitRow } | { kind: 'other'; row: OtherRow }>
  visits: VisitRow[]
  others: OtherRow[]
  travel: Array<Extract<AgendaEntry, { kind: 'travel' }>>
  next: VisitRow | null
}

/** "45 minutes", "1 hour 30 minutes". */
export function minutesLong(min: number): string {
  if (min < 60) return `${min} minute${min === 1 ? '' : 's'}`
  const h = Math.floor(min / 60)
  const m = min % 60
  const hours = `${h} hour${h === 1 ? '' : 's'}`
  return m === 0 ? hours : `${hours} ${m} minutes`
}

/** "45 min", "1 h 30 min". */
export function minutesShort(min: number): string {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

/** Builds the selected day: visits with their state, the other things on the calendar, and the travel buffers. */
export function buildDay(day: ScheduleDay | undefined, bufferMinutes: number, isToday: boolean, nowMin: number): DayModel {
  const entries = day ? buildAgenda(day.items, bufferMinutes) : []
  const travel = entries.filter((e): e is Extract<AgendaEntry, { kind: 'travel' }> => e.kind === 'travel')

  const bookings = entries.flatMap((e) => (e.kind === 'item' && e.item.type === 'booking' ? [e.item as ScheduleBookingItem] : []))
  // The next visit is the first one today that has not been arrived at and has not finished.
  const nextId = isToday
    ? bookings.find((b) => !b.checkedInAt && b.status !== 'completed' && toMinutes(b.end ?? b.start) > nowMin)?.id
    : undefined

  const rows: DayModel['rows'] = []
  const visits: VisitRow[] = []
  const others: OtherRow[] = []
  for (const [i, e] of entries.entries()) {
    if (e.kind !== 'item') continue
    const item: ScheduleItem = e.item
    if (item.type === 'booking') {
      const state: VisitState = item.checkedInAt || item.status === 'completed' ? 'done' : item.id === nextId ? 'next' : 'later'
      const travelBefore = travel.find((t) => t.forId === item.id && t.side === 'before') ?? null
      const label = SACRAMENT_LABEL[item.sacrament]
      const sub = item.isOffsite
        ? `${label}, off-site${travelBefore ? ` · leave by ${formatTime(travelBefore.start)}` : ''}`
        : label
      let pill: VisitRow['pill'] = null
      if (state === 'done' && item.checkedInAt) pill = { text: 'Arrived', tone: 'done' }
      else if (state === 'next') pill = { text: `Next · in ${minutesShort(Math.max(0, toMinutes(item.start) - nowMin))}`, tone: 'next' }
      else if (item.status === 'returned') pill = { text: 'Needs changes', tone: 'pending' }
      else if (item.status === 'submitted') pill = { text: 'Awaiting review', tone: 'pending' }
      const row: VisitRow = { key: item.id, item, first: item.subjectName.split(' ')[0] ?? item.subjectName, state, pill, sub, travelBefore }
      visits.push(row)
      rows.push({ kind: 'visit', row })
    } else {
      const row: OtherRow =
        item.type === 'mass'
          ? { key: `mass-${i}`, title: item.title, start: item.start, end: item.end, sub: 'Mass' }
          : { key: `session-${i}`, title: `${SACRAMENT_LABEL[item.sacrament]} session`, start: item.start, end: item.end, sub: `${item.booked} of ${item.capacity} booked` }
      others.push(row)
      rows.push({ kind: 'other', row })
    }
  }
  return { rows, visits, others, travel, next: visits.find((v) => v.state === 'next') ?? null }
}

/** The 4 rows of the Waiting card; the bars are relative to the largest. */
export function waitingMix(a: AttentionCounts): Array<{ key: string; label: string; n: number; to: string }> {
  return [
    { key: 'review', label: 'Review', n: a.awaitingReview, to: '/bookings?status=submitted' },
    { key: 'cert', label: 'Certificates', n: a.certificateRequests, to: '/certificate-requests' },
    { key: 'refund', label: 'Refunds', n: a.refundDue, to: '/bookings?paymentStatus=refund_due' },
    { key: 'hold', label: 'Holds', n: a.holdsExpiringSoon, to: '/bookings?status=submitted' },
  ]
}

export function waitingTotal(a: AttentionCounts): number {
  return a.awaitingReview + a.certificateRequests + a.refundDue + a.holdsExpiringSoon
}

/** "2 hours", "45 minutes" until an ISO instant (rounded up to the next whole minute, never below one). */
export function untilIso(iso: string, now: Date): string {
  const min = Math.max(1, Math.ceil((new Date(iso).getTime() - now.getTime()) / 60000))
  return minutesLong(min >= 90 ? Math.round(min / 60) * 60 : min)
}

/** Whole days since an ISO instant, in words: "today", "1 day", "2 days". */
export function waitedFor(iso: string, now: Date): string {
  const days = Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 86400000))
  return days === 0 ? 'waiting since today' : `waiting ${days} day${days === 1 ? '' : 's'}`
}

export function waitingCopy(w: WaitingPreviewItem, now: Date, peso: (c: number) => string): { status: string; tone: 'pending' | 'danger'; action: string } {
  if (w.kind === 'hold') return { status: `Payment hold ends in ${untilIso(w.holdExpiresAt ?? now.toISOString(), now)}`, tone: 'pending', action: 'Take payment' }
  if (w.kind === 'refund') return { status: `Refund of ${peso(w.refundCentavos ?? 0)} due`, tone: 'danger', action: 'Record refund' }
  return { status: `${SACRAMENT_LABEL[w.sacrament]} · ${waitedFor(w.submittedAt ?? now.toISOString(), now)}`, tone: 'pending', action: 'Review' }
}

/** The one sentence under the page title: what is next, and what is running out. */
export function findingText(args: {
  isToday: boolean
  todayVisits: number
  next: VisitRow | null
  nowMin: number
  waiting: number
  holds: WaitingPreviewItem[]
  holdCount: number
  now: Date
}): string {
  const { todayVisits, next, nowMin, waiting, holds, holdCount, now } = args
  const parts: string[] = []
  if (next) {
    const wait = Math.max(0, toMinutes(next.item.start) - nowMin)
    const what = `${next.item.subjectName}'s ${SACRAMENT_LABEL[next.item.sacrament].toLowerCase()}`
    parts.push(wait === 0 ? `${what} is happening now.` : `${what} is next, in ${minutesLong(wait)}.`)
  } else if (todayVisits > 0) {
    parts.push(`${todayVisits === 1 ? 'One visit' : `${todayVisits} visits`} today, none left to come.`)
  }
  if (holdCount === 1 && holds[0]?.holdExpiresAt) parts.push(`One payment hold ends in ${untilIso(holds[0].holdExpiresAt, now)}.`)
  else if (holdCount > 1) parts.push(`${holdCount} payment holds end within 12 hours.`)
  if (parts.length === 0) {
    return waiting === 0 ? 'Nothing is waiting and there are no visits today.' : `${waiting} ${waiting === 1 ? 'item is' : 'items are'} waiting for you. No visits today.`
  }
  return parts.join(' ')
}

/** "Today", "Tomorrow", then the weekday and date ("Thu, Nov 5"), for a visit that falls due soon. */
export function dueWhen(date: string, today: string): string {
  if (date === today) return 'Today'
  if (date === addDays(today, 1)) return 'Tomorrow'
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
}

const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

export function weekdayLetter(date: string): string {
  return WEEKDAY_LETTERS[new Date(`${date}T00:00:00Z`).getUTCDay()]
}

export function isWeekend(date: string): boolean {
  const d = new Date(`${date}T00:00:00Z`).getUTCDay()
  return d === 0 || d === 6
}

/** "November 4" from a Y-m-d date. */
export function longMonthDay(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' })
}

/** "Nov 4" from a Y-m-d date. */
export function shortMonthDay(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

/** "Tuesday, November 3". */
export function weekdayMonthDay(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' })
}
