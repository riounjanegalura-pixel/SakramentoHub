import * as mock from '../mock/bookings'
import * as api from '../api/bookings'
import { useApi } from './useApi'

export const saveDraft = useApi ? api.saveDraft : mock.saveDraft
export const updateDraft = useApi ? api.updateDraft : mock.updateDraft
export const submitBooking = useApi ? api.submitBooking : mock.submitBooking
export const cancelBooking = useApi ? api.cancelBooking : mock.cancelBooking
export const rescheduleBooking = useApi ? api.rescheduleBooking : mock.rescheduleBooking
export const fetchBookings = useApi ? api.fetchBookings : mock.fetchBookings
export const fetchBooking = useApi ? api.fetchBooking : mock.fetchBooking
export const initiatePayment = useApi ? api.initiatePayment : mock.initiatePayment
export const fetchPaymentQr = useApi ? api.fetchPaymentQr : mock.fetchPaymentQr
export const sendSimulatedCode = useApi ? api.sendSimulatedCode : mock.sendSimulatedCode
export const confirmSimulatedPayment = useApi ? api.confirmSimulatedPayment : mock.confirmSimulatedPayment
export const chooseCashPayment = useApi ? api.chooseCashPayment : mock.chooseCashPayment
export const fetchCertificateHtml = useApi ? api.fetchCertificateHtml : mock.fetchCertificateHtml
export const attachLateDocument = useApi ? api.attachLateDocument : mock.attachLateDocument
