import type { AdminService, FeeRule, ServiceUpdate } from '../../lib/types'

/** Every field as the string an <input> holds; `toPayload` converts back and sends only what changed. */
export interface ServiceForm {
  name: string
  description: string
  feeRule: FeeRule
  price: string // pesos
  durationMinutes: string
  allowedWeekdays: number[] // ISO: 1 = Monday … 7 = Sunday, kept sorted
  leadTimeDays: string
  dailyCapacity: string // blank = no limit
  sessionWeekdays: number[]
  sessionTimes: string // "10:00, 14:00"
  sessionCapacity: string
  sessionDurationMinutes: string
}

const sorted = (xs: number[]) => [...xs].sort((a, b) => a - b)
const text = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n))
const cents = (pesos: string) => Math.round(Number(pesos) * 100)

export function toForm(s: AdminService): ServiceForm {
  return {
    name: s.name,
    description: s.description ?? '',
    feeRule: s.feeRule,
    price: s.priceCentavos === null ? '' : (s.priceCentavos / 100).toFixed(2),
    durationMinutes: String(s.durationMinutes),
    allowedWeekdays: sorted(s.allowedWeekdays),
    leadTimeDays: String(s.leadTimeDays),
    dailyCapacity: text(s.dailyCapacity),
    sessionWeekdays: sorted(s.sessionWeekdays ?? []),
    sessionTimes: (s.sessionTimes ?? []).join(', '),
    sessionCapacity: text(s.sessionCapacity),
    sessionDurationMinutes: text(s.sessionDurationMinutes),
  }
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

export function toPayload(base: ServiceForm, form: ServiceForm, hasSessions: boolean): ServiceUpdate {
  const out: ServiceUpdate = {}
  if (form.name.trim() !== base.name) out.name = form.name.trim()
  if (form.description.trim() !== base.description) out.description = form.description.trim() || null
  if (form.feeRule !== base.feeRule) out.feeRule = form.feeRule
  // 'none' sends no price: the server clears it. Any other rule needs the price in the same request when it changed.
  if (form.feeRule !== 'none' && (form.feeRule !== base.feeRule || cents(form.price) !== cents(base.price))) {
    out.priceCentavos = cents(form.price)
  }
  if (form.durationMinutes !== base.durationMinutes) out.durationMinutes = Number(form.durationMinutes)
  if (!same(sorted(form.allowedWeekdays), sorted(base.allowedWeekdays))) out.allowedWeekdays = sorted(form.allowedWeekdays)
  if (form.leadTimeDays !== base.leadTimeDays) out.leadTimeDays = Number(form.leadTimeDays)
  if (form.dailyCapacity.trim() !== base.dailyCapacity) out.dailyCapacity = form.dailyCapacity.trim() === '' ? null : Number(form.dailyCapacity)

  if (hasSessions) {
    if (!same(sorted(form.sessionWeekdays), sorted(base.sessionWeekdays))) out.sessionWeekdays = sorted(form.sessionWeekdays)
    const times = (v: string) => v.split(',').map((t) => t.trim()).filter(Boolean)
    if (!same(times(form.sessionTimes), times(base.sessionTimes))) out.sessionTimes = times(form.sessionTimes)
    if (form.sessionCapacity !== base.sessionCapacity) out.sessionCapacity = Number(form.sessionCapacity)
    if (form.sessionDurationMinutes !== base.sessionDurationMinutes) out.sessionDurationMinutes = Number(form.sessionDurationMinutes)
  }
  return out
}
