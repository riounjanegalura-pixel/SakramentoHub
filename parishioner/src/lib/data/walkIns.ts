import * as mock from '../mock/walkIns'
import * as api from '../api/walkIns'
import { useApi } from './useApi'

export const createWalkIn = useApi ? api.createWalkIn : mock.createWalkIn
export const updateWalkIn = useApi ? api.updateWalkIn : mock.updateWalkIn
export const submitWalkIn = useApi ? api.submitWalkIn : mock.submitWalkIn
export const lookupParishioner = useApi ? api.lookupParishioner : mock.lookupParishioner
export const fetchDeskBooking = useApi ? api.fetchDeskBooking : mock.fetchDeskBooking
export const markCashReceived = useApi ? api.markCashReceived : mock.markCashReceived
export const createPaymentLink = useApi ? api.createPaymentLink : mock.createPaymentLink
export type { WalkInBody, LeadTimeWaiver } from '../api/walkIns'
