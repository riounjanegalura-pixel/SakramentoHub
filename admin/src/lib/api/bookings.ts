import { apiFetch, apiFetchText } from './client'
import type { AdminBooking, AuditLogEntry, BookingNote, BookingStatus, Channel, Paginated, PaymentStatus, Sacrament } from '../types'

/** One value, or several that are matched as "any of" (sent comma-separated). */
type OneOrMany<T extends string> = T | '' | readonly T[]

export interface BookingsQuery {
  status?: OneOrMany<BookingStatus>
  paymentStatus?: OneOrMany<PaymentStatus>
  channel?: OneOrMany<Channel>
  sacrament?: OneOrMany<Sacrament>
  priority?: boolean
  search?: string
  /** Appointment date range; the server needs both, so both are sent or neither is. */
  from?: string
  to?: string
  /** `overpaid` = paid bookings holding more than the fee. */
  attention?: 'overpaid' | ''
  /** 1-100, server default 15. */
  perPage?: number
  page?: number
}

const joined = (v: string | readonly string[] | undefined): string => (Array.isArray(v) ? v.join(',') : ((v as string | undefined) ?? ''))

function toQueryString(query: BookingsQuery): string {
  const params = new URLSearchParams()
  for (const key of ['status', 'paymentStatus', 'channel', 'sacrament'] as const) {
    const value = joined(query[key])
    if (value) params.set(key, value)
  }
  if (query.priority) params.set('priority', '1')
  // Trimmed, and only sent when non-empty — an empty search param is
  // dropped entirely rather than sent as `search=`, matching what the
  // backend's own "empty search returns everything" test exercises (see
  // AdminBookingTest.php).
  if (query.search?.trim()) params.set('search', query.search.trim())
  if (query.from && query.to) {
    params.set('from', query.from)
    params.set('to', query.to)
  }
  if (query.attention) params.set('attention', query.attention)
  if (query.perPage) params.set('perPage', String(query.perPage))
  if (query.page) params.set('page', String(query.page))
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

export async function fetchBookings(query: BookingsQuery = {}): Promise<Paginated<AdminBooking>> {
  return apiFetch<Paginated<AdminBooking>>(`/admin/bookings${toQueryString(query)}`)
}

export interface BookingCounts {
  total: number
  bySacrament: Partial<Record<Sacrament, number>>
}

/** Per-sacrament counts for the queue's category tabs, in one request.
 * Honors every filter the list honors except sacrament (it counts every
 * category), priority (which only reorders) and perPage. */
export async function fetchBookingCounts(
  query: Pick<BookingsQuery, 'status' | 'paymentStatus' | 'channel' | 'search' | 'from' | 'to' | 'attention'> = {},
): Promise<BookingCounts> {
  return apiFetch<BookingCounts>(`/admin/bookings/counts${toQueryString(query)}`)
}

export async function fetchBooking(id: string): Promise<AdminBooking> {
  return apiFetch<AdminBooking>(`/admin/bookings/${id}`)
}

export async function approveBooking(id: string): Promise<AdminBooking> {
  return apiFetch<AdminBooking>(`/admin/bookings/${id}/approve`, { method: 'PATCH' })
}

export async function declineBooking(id: string, reason: string): Promise<AdminBooking> {
  return apiFetch<AdminBooking>(`/admin/bookings/${id}/decline`, { method: 'PATCH', body: JSON.stringify({ reason }) })
}

/** The note is optional when at least one document is rejected (the server names them). */
export async function returnBooking(id: string, note?: string): Promise<AdminBooking> {
  const trimmed = note?.trim()
  return apiFetch<AdminBooking>(`/admin/bookings/${id}/return`, {
    method: 'PATCH',
    body: JSON.stringify(trimmed ? { note: trimmed } : {}),
  })
}

export async function reviewDocument(
  id: string,
  key: string,
  status: 'accepted' | 'rejected',
  note?: string,
): Promise<AdminBooking> {
  return apiFetch<AdminBooking>(`/admin/bookings/${id}/documents/${encodeURIComponent(key)}`, {
    method: 'PUT',
    body: JSON.stringify(note ? { status, note } : { status }),
  })
}

/** The office adds one of a walk-in wedding's later documents; the file was uploaded with `uploadDocument`. */
export async function attachLateDocument(bookingId: string, key: string, fileUrl: string): Promise<AdminBooking> {
  return apiFetch<AdminBooking>(`/admin/bookings/${bookingId}/documents/${encodeURIComponent(key)}/attach`, {
    method: 'POST',
    body: JSON.stringify({ fileUrl }),
  })
}

export interface RescheduleInput {
  appointmentDate: string
  appointmentStart: string
  reason: string
  waiveLeadTime?: boolean
}

export async function rescheduleBooking(id: string, input: RescheduleInput): Promise<AdminBooking> {
  return apiFetch<AdminBooking>(`/admin/bookings/${id}/reschedule`, { method: 'PATCH', body: JSON.stringify(input) })
}

export async function recordPartialRefund(id: string, reference: string, amountCentavos: number): Promise<AdminBooking> {
  return apiFetch<AdminBooking>(`/admin/bookings/${id}/partial-refund`, {
    method: 'PATCH',
    body: JSON.stringify({ reference, amountCentavos }),
  })
}

/** The GCash checkout link for an unpaid booking, to hand to a walk-in or resend. 409 = already paid. */
export async function createPaymentLink(id: string): Promise<{ checkoutUrl: string; checkoutSessionId: string }> {
  return apiFetch<{ checkoutUrl: string; checkoutSessionId: string }>(`/admin/bookings/${id}/payment`, { method: 'POST' })
}

export async function fetchBookingNotes(id: string): Promise<BookingNote[]> {
  return apiFetch<BookingNote[]>(`/admin/bookings/${id}/notes`)
}

export async function addBookingNote(id: string, body: string): Promise<BookingNote> {
  return apiFetch<BookingNote>(`/admin/bookings/${id}/notes`, { method: 'POST', body: JSON.stringify({ body }) })
}

/** Plain array (not paginated), oldest first. */
export async function fetchBookingHistory(id: string): Promise<AuditLogEntry[]> {
  return apiFetch<AuditLogEntry[]>(`/admin/bookings/${id}/history`)
}

export async function cancelBooking(id: string, reason: string): Promise<AdminBooking> {
  return apiFetch<AdminBooking>(`/admin/bookings/${id}/cancel`, { method: 'PATCH', body: JSON.stringify({ reason }) })
}

export async function markRefunded(id: string, reference: string, note?: string): Promise<AdminBooking> {
  return apiFetch<AdminBooking>(`/admin/bookings/${id}/refund`, { method: 'PATCH', body: JSON.stringify({ reference, note }) })
}

/** Cash taken at the counter for an unpaid or pending_cash booking still holding its slot; the receipt number is optional. */
export async function markCashReceived(id: string, receiptReference?: string): Promise<AdminBooking> {
  return apiFetch<AdminBooking>(`/admin/bookings/${id}/cash-received`, { method: 'PATCH', body: JSON.stringify({ receiptReference: receiptReference || null }) })
}

export async function completeBooking(id: string): Promise<AdminBooking> {
  return apiFetch<AdminBooking>(`/admin/bookings/${id}/complete`, { method: 'PATCH' })
}

/** Fetches the booking's certificate HTML (404 "No certificate yet." before it is completed). The GET is
 * bearer-token-protected, so it can't be a plain <a href> — callers open the returned markup
 * through openHtmlInNewTab instead. */
export async function fetchCertificateHtml(id: string): Promise<string> {
  return apiFetchText(`/admin/bookings/${id}/certificate`)
}

/** Body of a preparation tick. `done: false` unticks. The marriage license takes `art34` + note, or its three details. */
export interface MilestoneInput {
  done: boolean
  note?: string
  art34?: boolean
  licenseNumber?: string
  issuedOn?: string
  issuedAt?: string
}

export async function tickMilestone(id: string, key: string, input: MilestoneInput): Promise<AdminBooking> {
  return apiFetch<AdminBooking>(`/admin/bookings/${id}/milestones/${encodeURIComponent(key)}`, { method: 'PUT', body: JSON.stringify(input) })
}

/** Marks the party as arrived. The server decides whether today is the appointment day (422 with the reason otherwise). */
export async function checkInBooking(id: string): Promise<AdminBooking> {
  return apiFetch<AdminBooking>(`/admin/bookings/${id}/check-in`, { method: 'POST' })
}

/** The booking a day-pass QR code names (case and surrounding spaces ignored); 404 "No booking with that reference." */
export async function fetchBookingByReference(reference: string): Promise<AdminBooking> {
  return apiFetch<AdminBooking>(`/admin/bookings/by-reference/${encodeURIComponent(reference.trim())}`)
}
