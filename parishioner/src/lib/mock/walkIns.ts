import type * as api from '../api/walkIns'

export const DESK_UNAVAILABLE_MESSAGE = 'The office desk is not available in demo mode.'

async function unavailable(): Promise<never> {
  throw new Error(DESK_UNAVAILABLE_MESSAGE)
}

export const createWalkIn: typeof api.createWalkIn = () => unavailable()
export const updateWalkIn: typeof api.updateWalkIn = () => unavailable()
export const submitWalkIn: typeof api.submitWalkIn = () => unavailable()
export const lookupParishioner: typeof api.lookupParishioner = () => unavailable()
export const fetchDeskBooking: typeof api.fetchDeskBooking = () => unavailable()
export const markCashReceived: typeof api.markCashReceived = () => unavailable()
export const createPaymentLink: typeof api.createPaymentLink = () => unavailable()
