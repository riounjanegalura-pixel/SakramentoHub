import { apiFetch } from './client'
import type { DonationStatus } from '../types'

/** A gift starts either as a GCash checkout redirect or, with QR Ph on, as a QR code to scan. */
export type DonationStart = {
  checkoutUrl?: string
  donationId?: string
  qrImage?: string
  amountCentavos?: number
  reference?: string
}

/** Opens a payment for a gift of amountCentavos; open to a signed-out donor too. */
export async function createDonation(amountCentavos: number): Promise<DonationStart> {
  return apiFetch<DonationStart>('/donations', { method: 'POST', body: JSON.stringify({ amountCentavos }) })
}

export async function fetchDonationStatus(id: string): Promise<DonationStatus> {
  return apiFetch<DonationStatus>(`/donations/${encodeURIComponent(id)}`)
}