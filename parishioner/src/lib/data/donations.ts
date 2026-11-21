import * as mock from '../mock/donations'
import * as api from '../api/donations'
import { useApi } from './useApi'
import type { DonationStatus } from '../types'

export const createDonation: (amountCentavos: number) => Promise<api.DonationStart> = useApi ? api.createDonation : mock.createDonation
export const fetchDonationStatus: (id: string) => Promise<DonationStatus> = useApi ? api.fetchDonationStatus : mock.fetchDonationStatus
