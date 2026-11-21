import { apiFetch, apiFetchText } from './client'
import type { Booking, DraftInput, DraftPatch, PaymentQr, SimulatedCodeSent } from '../types'

export async function saveDraft(input: DraftInput): Promise<Booking> {
  return apiFetch<Booking>('/bookings', {
    method: 'POST',
    body: JSON.stringify({
      sacrament: input.sacrament,
      formData: input.formData,
      appointmentDate: input.appointmentDate ?? null,
      appointmentStart: input.appointmentStart ?? null,
    }),
  })
}

export async function updateDraft(id: string, patch: DraftPatch): Promise<Booking> {
  return apiFetch<Booking>(`/bookings/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })
}

export async function submitBooking(id: string): Promise<Booking> {
  return apiFetch<Booking>(`/bookings/${id}/submit`, { method: 'PATCH' })
}

export async function cancelBooking(id: string, reason: string): Promise<Booking> {
  return apiFetch<Booking>(`/bookings/${id}/cancel`, { method: 'PATCH', body: JSON.stringify({ reason }) })
}

export async function rescheduleBooking(id: string, appointmentDate: string, appointmentStart: string): Promise<Booking> {
  return apiFetch<Booking>(`/bookings/${id}/reschedule`, {
    method: 'PATCH',
    body: JSON.stringify({ appointmentDate, appointmentStart }),
  })
}

export async function fetchBookings(_userId: string): Promise<Booking[]> {
  return apiFetch<Booking[]>('/bookings')
}

export async function fetchBooking(id: string): Promise<Booking> {
  return apiFetch<Booking>(`/bookings/${id}`)
}

export async function initiatePayment(id: string): Promise<{ checkoutUrl: string; checkoutSessionId: string }> {
  return apiFetch<{ checkoutUrl: string; checkoutSessionId: string }>(`/bookings/${id}/payment`, { method: 'POST' })
}

/** QR Ph (PAYMONGO_METHOD=qrph on the backend): the booking's QR code, reusing the open one. */
export async function fetchPaymentQr(id: string): Promise<PaymentQr> {
  return apiFetch<PaymentQr>(`/bookings/${id}/payment/qr`, { method: 'POST' })
}

/** Demo mode (PAYMENT_MODE=simulated on the backend): texts a real one-time code to the mobile number. */
export async function sendSimulatedCode(id: string, mobile: string): Promise<SimulatedCodeSent> {
  return apiFetch<SimulatedCodeSent>(`/bookings/${id}/payment/simulated/code`, { method: 'POST', body: JSON.stringify({ mobile }) })
}

/** Demo mode: a correct code records the payment (no money moves). Resolves to the paid booking. */
export async function confirmSimulatedPayment(id: string, code: string): Promise<Booking> {
  return apiFetch<Booking>(`/bookings/${id}/payment/simulated/confirm`, { method: 'POST', body: JSON.stringify({ code }) })
}

/** Pay cash at the parish office instead of GCash: the booking comes back `pending_cash`, its hold unchanged. */
export async function chooseCashPayment(id: string): Promise<Booking> {
  return apiFetch<Booking>(`/bookings/${id}/payment/cash`, { method: 'POST' })
}

export async function fetchCertificateHtml(id: string): Promise<string> {
  return apiFetchText(`/bookings/${id}/certificate`)
}

/** Adds or replaces one of a wedding's later documents; `fileUrl` is what `POST /documents` returned. */
export async function attachLateDocument(bookingId: string, key: string, fileUrl: string): Promise<Booking> {
  return apiFetch<Booking>(`/bookings/${bookingId}/documents/${key}`, { method: 'PUT', body: JSON.stringify({ fileUrl }) })
}
