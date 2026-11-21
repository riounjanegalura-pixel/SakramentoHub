import { apiFetch } from './client'
import type { DayAvailability, RangeDay, ScheduleContext, Sacrament } from '../types'

/**
 * `excludeBookingId` names the caller's own booking (a returned booking being
 * edited, or the saved draft) so it does not block its own slot. The server
 * ignores it unless the booking belongs to the signed-in user (staff may name any).
 * `ctx.waiveLeadTime` is honoured by the server for a signed-in staff account
 * only (the office desk).
 */
function contextQuery(ctx: ScheduleContext, excludeBookingId?: string): string {
  const params = new URLSearchParams()
  if (ctx.scheduleType) params.set('scheduleType', ctx.scheduleType)
  if (ctx.massType) params.set('massType', ctx.massType)
  if (ctx.waiveLeadTime) params.set('waiveLeadTime', '1')
  if (excludeBookingId) params.set('excludeBookingId', excludeBookingId)
  const qs = params.toString()
  return qs ? `&${qs}` : ''
}

export async function fetchDayAvailability(
  sacrament: Sacrament,
  date: string,
  ctx: ScheduleContext = {},
  excludeBookingId?: string,
): Promise<DayAvailability> {
  return apiFetch<DayAvailability>(`/services/${sacrament}/availability?date=${encodeURIComponent(date)}${contextQuery(ctx, excludeBookingId)}`)
}

export async function fetchAvailabilityDays(
  sacrament: Sacrament,
  start: string,
  end: string,
  ctx: ScheduleContext = {},
  excludeBookingId?: string,
): Promise<RangeDay[]> {
  const res = await apiFetch<{ sacrament: Sacrament; days: RangeDay[] }>(
    `/services/${sacrament}/availability-range?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}${contextQuery(ctx, excludeBookingId)}`,
  )
  return res.days
}
