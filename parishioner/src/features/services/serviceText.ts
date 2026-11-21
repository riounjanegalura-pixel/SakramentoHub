import { formatTime, peso } from '../../lib/domain'
import type { RequirementDocument, Service } from '../../lib/types'

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const dayNames = (days: number[]) => [...days].sort((a, b) => a - b).map((d) => WEEKDAYS[d - 1]).filter(Boolean).join(', ')

/** "Book at least N days ahead", or null when a service needs no lead time. */
export function leadText(service: Service): string | null {
  if (service.leadTimeDays <= 0) return null
  return `Book at least ${service.leadTimeDays} ${service.leadTimeDays === 1 ? 'day' : 'days'} ahead`
}

/** The lead time as a sentence, always: a zero lead time is stated, not left blank. */
export function leadLabel(service: Service): string {
  return leadText(service) ?? 'No minimum lead time'
}

export function servicesCountText(count: number): string {
  return `${count} ${count === 1 ? 'service' : 'services'} available`
}

export function feeText(service: Service): string {
  if (service.feeRule === 'none' || service.priceCentavos === null || service.priceCentavos === 0) return 'No fee'
  return service.feeRule === 'per_sponsor' ? `${peso(service.priceCentavos)} per sponsor` : peso(service.priceCentavos)
}

/** True when the parish quotes a fee; "No fee" is not shown as a line of its own on the list. */
export function hasFee(service: Service): boolean {
  return feeText(service) !== 'No fee'
}

export function daysText(service: Service): string | null {
  const parts: string[] = []
  if (service.allowedWeekdays.length) parts.push(dayNames(service.allowedWeekdays))
  if (service.sessionWeekdays?.length && service.sessionTimes?.length) {
    parts.push(`Group session on ${dayNames(service.sessionWeekdays)} at ${service.sessionTimes.map(formatTime).join(', ')}`)
  }
  return parts.length ? parts.join('. ') : null
}

export function requirementText(doc: RequirementDocument): string {
  if (doc.requirement === 'required') return 'Required'
  if (doc.requirement === 'conditional') return doc.condition ?? 'Required in some cases'
  return 'Optional'
}
