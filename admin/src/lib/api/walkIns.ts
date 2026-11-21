import { apiFetch } from './client'
import type { AdminBooking, Sacrament } from '../types'

export interface WalkInField {
  key: string
  label: string
  type: 'text' | 'date' | 'number' | 'select' | 'yesno'
  options?: string[]
  required: boolean
}

export interface WalkInSchema {
  fields: WalkInField[]
  /** Principal sponsors (baptism, confirmation, wedding); null when the sacrament has none. */
  sponsors: { min: number; max: number; fields: WalkInField[] } | null
  documents: Array<{ key: string; label: string; requirement: 'required' | 'optional' | 'conditional'; condition: string | null }>
}

/** The form the server will accept for a sacrament, read from the server's own rules. */
export function fetchWalkInSchema(sacrament: Sacrament): Promise<WalkInSchema> {
  return apiFetch<WalkInSchema>(`/admin/walk-ins/fields/${sacrament}`)
}

export interface WalkInInput {
  contact: { fullName: string; phone: string; email: string | null; relationship: string | null }
  linkUserId: string | null
  formData: Record<string, unknown>
  appointmentDate: string | null
  appointmentStart: string | null
}

type Wrapped<T> = T | { data: T }
const unwrap = <T>(r: Wrapped<T>): T => (r && typeof r === 'object' && 'data' in r ? (r as { data: T }).data : (r as T))

export async function createWalkIn(sacrament: Sacrament, input: WalkInInput): Promise<AdminBooking> {
  return unwrap(await apiFetch<Wrapped<AdminBooking>>('/admin/walk-ins', { method: 'POST', body: JSON.stringify({ sacrament, ...input }) }))
}

export async function updateWalkIn(id: string, input: WalkInInput): Promise<AdminBooking> {
  return unwrap(await apiFetch<Wrapped<AdminBooking>>(`/admin/walk-ins/${id}`, { method: 'PATCH', body: JSON.stringify(input) }))
}

export async function submitWalkIn(id: string, waive: { waiveLeadTime: boolean; waiveReason: string }): Promise<AdminBooking> {
  return unwrap(
    await apiFetch<Wrapped<AdminBooking>>(`/admin/walk-ins/${id}/submit`, {
      method: 'PATCH',
      body: JSON.stringify(waive.waiveLeadTime ? waive : { waiveLeadTime: false }),
    }),
  )
}

/** An account the office may link a walk-in to, found by exact email. */
export function lookupParishioner(email: string): Promise<{ id: string; fullName: string }> {
  return apiFetch(`/admin/parishioners/lookup?email=${encodeURIComponent(email)}`)
}

/** Free start times ("HH:MM") for a day. `massType` and `scheduleType` change what is free, so they are passed along. */
export async function fetchFreeStarts(sacrament: Sacrament, date: string, context: { massType?: string; scheduleType?: string; waiveLeadTime?: boolean }): Promise<string[]> {
  const params = new URLSearchParams({ date })
  if (context.massType) params.set('massType', context.massType)
  if (context.scheduleType) params.set('scheduleType', context.scheduleType)
  if (context.waiveLeadTime) params.set('waiveLeadTime', '1')
  const res = await apiFetch<{ freeStarts: string[] }>(`/services/${sacrament}/availability?${params}`)
  return res.freeStarts
}
