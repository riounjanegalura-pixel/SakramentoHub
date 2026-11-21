import * as mock from '../mock/certificateRequests'
import * as api from '../api/certificateRequests'
import { useApi } from './useApi'

export const fetchMyCertificateRequests = useApi ? api.fetchMyCertificateRequests : mock.fetchMyCertificateRequests
export const createCertificateRequest = useApi ? api.createCertificateRequest : mock.createCertificateRequest
export const cancelCertificateRequest = useApi ? api.cancelCertificateRequest : mock.cancelCertificateRequest
