import * as mock from '../mock/donations'
import * as api from '../api/donations'
import { useApi } from './useApi'

export const createDonation: (amountCentavos: number) => Promise<api.DonationStart> = useApi ? api.createDonation : mock.createDonation
export const fetchDonationStatus: (id: string) => Promise<{ status: 'pending' | 'paid' }> = useApi ? api.fetchDonationStatus : mock.fetchDonationStatus
