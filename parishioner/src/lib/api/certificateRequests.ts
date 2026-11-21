import { apiFetch } from './client'
import type { CertificateRequest, CertificateRequestInput } from '../types'

export async function fetchMyCertificateRequests(): Promise<CertificateRequest[]> {
  return apiFetch<CertificateRequest[]>('/certificate-requests')
}

export async function createCertificateRequest(input: CertificateRequestInput): Promise<CertificateRequest> {
  return apiFetch<CertificateRequest>('/certificate-requests', { method: 'POST', body: JSON.stringify(input) })
}

export async function cancelCertificateRequest(id: string): Promise<CertificateRequest> {
  return apiFetch<CertificateRequest>(`/certificate-requests/${id}/cancel`, { method: 'POST' })
}
