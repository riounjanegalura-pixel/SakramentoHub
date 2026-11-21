import { apiFetch, ApiError } from './client'
import type { DeskBooking, ParishionerMatch, PaymentLink, Sacrament } from '../types'

export interface WalkInBody {
  /** `relationship`: who the person at the counter is to the one receiving the sacrament (owner_snapshot, max 80). */
  contact: { fullName: string; phone: string; email: string | null; relationship: string | null }
  linkUserId: string | null
  formData: Record<string, unknown>
  appointmentDate: string | null
  appointmentStart: string | null
}

export interface LeadTimeWaiver {
  waiveLeadTime: boolean
  waiveReason: string
}

export function createWalkIn(sacrament: Sacrament, body: WalkInBody): Promise<DeskBooking> {
  return apiFetch<DeskBooking>('/admin/walk-ins', { method: 'POST', body: JSON.stringify({ sacrament, ...body }) })
}

export function updateWalkIn(id: string, body: WalkInBody): Promise<DeskBooking> {
  return apiFetch<DeskBooking>(`/admin/walk-ins/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
}

export function submitWalkIn(id: string, waiver: LeadTimeWaiver): Promise<DeskBooking> {
  const body = waiver.waiveLeadTime ? { waiveLeadTime: true, waiveReason: waiver.waiveReason.trim() } : {}
  return apiFetch<DeskBooking>(`/admin/walk-ins/${id}/submit`, { method: 'PATCH', body: JSON.stringify(body) })
}

/** The account to offer for linking, or null when no active verified parishioner uses that email. */
export async function lookupParishioner(email: string): Promise<ParishionerMatch | null> {
  try {
    return await apiFetch<ParishionerMatch>(`/admin/parishioners/lookup?email=${encodeURIComponent(email)}`)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
}

/** The person at the counter paid cash: marks the booking paid (the office's own receipt number is optional). */
export function markCashReceived(id: string, receiptReference: string): Promise<DeskBooking> {
  return apiFetch<DeskBooking>(`/admin/bookings/${id}/cash-received`, { method: 'PATCH', body: JSON.stringify({ receiptReference: receiptReference.trim() || null }) })
}

export function fetchDeskBooking(id: string): Promise<DeskBooking> {
  return apiFetch<DeskBooking>(`/admin/bookings/${id}`)
}

/**
 * The GCash checkout link for an unpaid booking (the server reuses an open session).
 * Null when the booking is already paid (409); any other refusal is thrown.
 */
export async function createPaymentLink(id: string): Promise<PaymentLink | null> {
  try {
    return await apiFetch<PaymentLink>(`/admin/bookings/${id}/payment`, { method: 'POST' })
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) return null
    throw error
  }
}
