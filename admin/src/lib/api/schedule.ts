import { apiFetch } from './client'
import type { DayAvailability, Sacrament, Schedule } from '../types'

export async function fetchSchedule(start: string, end: string): Promise<Schedule> {
  return apiFetch<Schedule>(`/admin/schedule?start=${start}&end=${end}`)
}

export interface AvailabilityOptions {
  scheduleType?: string
  massType?: string
  /** The booking being moved; a signed-in staff caller may name any booking. */
  excludeBookingId?: string
  /** Honoured by the server for staff only. */
  waiveLeadTime?: boolean
}

export async function fetchAvailability(
  sacrament: Sacrament,
  date: string,
  options: AvailabilityOptions = {},
): Promise<DayAvailability> {
  const params = new URLSearchParams({ date })
  if (options.scheduleType) params.set('scheduleType', options.scheduleType)
  if (options.massType) params.set('massType', options.massType)
  if (options.excludeBookingId) params.set('excludeBookingId', options.excludeBookingId)
  if (options.waiveLeadTime) params.set('waiveLeadTime', '1')
  return apiFetch<DayAvailability>(`/services/${sacrament}/availability?${params.toString()}`)
}
