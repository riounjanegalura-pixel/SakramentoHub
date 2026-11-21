import { simulateLatency } from './latency'
import type { Booking, DayAvailability, RangeDay, Sacrament, ScheduleContext } from '../types'
import { SERVICES as SCHEDULE_SERVICES } from './services'
import { readBookings } from './booking-storage'
import { addDaysYmd, parishToday } from '../domain'

// ── New-contract mock scheduling (mirrors backend SchedulingService, minus blackouts) ──

const OPEN = 8 * 60
const CLOSE = 17 * 60
const STEP = 30
const LUNCH_START = 12 * 60
const LUNCH_END = 13 * 60
const TRAVEL = 30
const HOLDING = ['submitted', 'returned', 'approved', 'completed']
const SESSION_MINUTES = 60

/** Mirrors Booking::scopeHoldingSlot: an unpaid booking past its hold and a returned booking past 7 days stop blocking. */
function holdsSlot(b: Booking): boolean {
  if (!HOLDING.includes(b.status)) return false
  const now = Date.now()
  if ((b.paymentStatus === 'unpaid' || b.paymentStatus === 'pending_cash') && b.paymentHoldExpiresAt && new Date(b.paymentHoldExpiresAt).getTime() <= now) return false
  if (b.status === 'returned' && b.returnedAt && new Date(b.returnedAt).getTime() <= now - 7 * 86400_000) return false
  return true
}

/** Mirrors Booking::holdsItsReturnedSlot: a returned booking holds the slot it was returned with for 7 days. */
export function holdsReturnedSlot(b: Booking): boolean {
  if (b.status !== 'returned' || !b.returnedSlot || !b.returnedAt) return false
  if (new Date(b.returnedAt).getTime() <= Date.now() - 7 * 86400_000) return false
  return b.appointmentDate === b.returnedSlot.date && b.appointmentStart === b.returnedSlot.start
}

export const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}
export const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
const isoWeekday = (ymd: string) => {
  const d = new Date(`${ymd}T00:00:00`).getDay()
  return d === 0 ? 7 : d
}
function manilaMinutesNow(): number {
  const [h, m] = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: false })
    .format(new Date()).split(':').map(Number)
  return h * 60 + m
}
function isOffsite(sacrament: Sacrament, massType: unknown): boolean {
  const service = SCHEDULE_SERVICES.find((s) => s.id === sacrament)!
  return service.offsite || (sacrament === 'funeral' && massType === 'house')
}

function baseDayStatus(sacrament: Sacrament, date: string, ctx: ScheduleContext, excludeId: string | undefined, bookingTime: boolean): DayAvailability {
  const service = SCHEDULE_SERVICES.find((s) => s.id === sacrament)!
  const session = bookingMinutes(sacrament, ctx) === SESSION_MINUTES && !!service.sessionTimes?.length
  const today = parishToday()
  const unavailable = (reason: string): DayAvailability => ({ date, status: 'unavailable', reason, freeStarts: [] })

  if (date < today) return unavailable('That date has already passed.')
  if (bookingTime && date < addDaysYmd(today, service.leadTimeDays)) {
    return unavailable(`${service.name} must be booked at least ${service.leadTimeDays} days ahead.`)
  }
  const weekdays = session ? service.sessionWeekdays ?? [] : service.allowedWeekdays
  if (!weekdays.includes(isoWeekday(date))) {
    const day = new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long' })
    return unavailable(`${service.name} is not scheduled on ${day}s.`)
  }

  const held = readBookings().filter(
    (b) => b.id !== excludeId && holdsSlot(b) && b.appointmentDate === date && !!b.appointmentStart,
  )
  const earliest = date === today ? manilaMinutesNow() + (bookingTime ? 60 : 0) : 0

  if (session) {
    const free = (service.sessionTimes ?? []).filter(
      (t) => toMin(t) >= earliest
        && held.filter((b) => b.sacrament === sacrament && b.appointmentStart === t).length < (service.sessionCapacity ?? 0),
    )
    const times = service.sessionTimes ?? []
    const remaining = times.reduce(
      (n, t) => n + Math.max(0, (service.sessionCapacity ?? 0) - held.filter((b) => b.sacrament === sacrament && b.appointmentStart === t).length),
      0,
    )
    const total = (service.sessionCapacity ?? 0) * times.length
    const status = free.length === 0 ? 'full' : remaining < total ? 'limited' : 'free'
    return { date, status, reason: null, freeStarts: free }
  }

  if (service.dailyCapacity !== null && held.filter((b) => b.sacrament === sacrament).length >= service.dailyCapacity) {
    return { date, status: 'full', reason: null, freeStarts: [] }
  }

  const blocked: Array<readonly [number, number]> = held.map((b) => {
    const pad = isOffsite(b.sacrament, b.formData.massType) ? TRAVEL : 0
    return [toMin(b.appointmentStart!) - pad, toMin(b.appointmentEnd ?? b.appointmentStart!) + pad] as const
  })
  for (const s of SCHEDULE_SERVICES) {
    if (s.sessionTimes && (s.sessionWeekdays ?? []).includes(isoWeekday(date))) {
      for (const t of s.sessionTimes) blocked.push([toMin(t), toMin(t) + 60] as const)
    }
  }

  const pad = isOffsite(sacrament, ctx.massType) ? TRAVEL : 0
  const possible: string[] = []
  for (let m = OPEN; m + service.durationMinutes <= CLOSE; m += STEP) if (m >= earliest && !(m < LUNCH_END && LUNCH_START < m + service.durationMinutes)) possible.push(toTime(m))
  const free = possible.filter((t) => {
    const s = toMin(t) - pad
    const e = toMin(t) + service.durationMinutes + pad
    return blocked.every(([bs, be]) => !(s < be && bs < e))
  })

  return { date, status: free.length === 0 ? 'full' : free.length < possible.length ? 'limited' : 'free', reason: null, freeStarts: free }
}

export function mockDayStatus(
  sacrament: Sacrament,
  date: string,
  ctx: ScheduleContext = {},
  excludeId?: string,
  bookingTime = true,
): DayAvailability {
  const normal = baseDayStatus(sacrament, date, ctx, excludeId, bookingTime)
  const own = excludeId ? readBookings().find((b) => b.id === excludeId) : undefined
  // The server re-offers the slot a returned booking still holds, even inside the lead time.
  if (!bookingTime || !own || own.sacrament !== sacrament || !holdsReturnedSlot(own) || own.appointmentDate !== date) return normal
  const start = own.appointmentStart!
  if (normal.freeStarts.includes(start)) return normal
  if (!baseDayStatus(sacrament, date, ctx, excludeId, false).freeStarts.includes(start)) return normal
  return { date, status: normal.status === 'unavailable' ? 'limited' : normal.status, reason: null, freeStarts: [...normal.freeStarts, start].sort() }
}

/** Length of a booking's slot: the Sunday session for a regular baptism, else the service's own duration. */
export function bookingMinutes(sacrament: Sacrament, ctx: ScheduleContext): number {
  const service = SCHEDULE_SERVICES.find((s) => s.id === sacrament)!
  return ctx.scheduleType === 'regular' && service.sessionTimes?.length ? SESSION_MINUTES : service.durationMinutes
}

export function endTime(sacrament: Sacrament, start: string, ctx: ScheduleContext): string {
  return toTime(toMin(start) + bookingMinutes(sacrament, ctx))
}

export async function fetchDayAvailability(
  sacrament: Sacrament,
  date: string,
  ctx: ScheduleContext = {},
  excludeBookingId?: string,
): Promise<DayAvailability> {
  await simulateLatency()
  return mockDayStatus(sacrament, date, ctx, excludeBookingId)
}

export async function fetchAvailabilityDays(
  sacrament: Sacrament,
  start: string,
  end: string,
  ctx: ScheduleContext = {},
  excludeBookingId?: string,
): Promise<RangeDay[]> {
  await simulateLatency()
  const days: RangeDay[] = []
  for (let d = start; d <= end; d = addDaysYmd(d, 1)) {
    const day = mockDayStatus(sacrament, d, ctx, excludeBookingId)
    days.push({ date: d, status: day.status, reason: day.reason, freeCount: day.freeStarts.length })
  }
  return days
}
