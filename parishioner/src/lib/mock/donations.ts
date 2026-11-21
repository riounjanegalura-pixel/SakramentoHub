import type { DonationStatus } from '../types'
export async function createDonation(amountCentavos: number): Promise<{ checkoutUrl: string }> {
  if (!Number.isInteger(amountCentavos) || amountCentavos < 2000) throw new Error('The smallest gift is ₱20.')
  return { checkoutUrl: '/donate/thanks' }
}

export async function fetchDonationStatus(_id: string): Promise<DonationStatus> {
  return { status: 'paid' }
}