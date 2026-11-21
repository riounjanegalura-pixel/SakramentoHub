import { apiFetch } from './client'
import type { AdminCertificateRequest, CertificateRequestStatus, Paginated } from '../types'

export interface CertificateRequestsQuery {
  status?: CertificateRequestStatus | ''
  search?: string
  perPage?: number
  page?: number
}

function toQueryString(query: CertificateRequestsQuery): string {
  const params = new URLSearchParams()
  if (query.status) params.set('status', query.status)
  if (query.search?.trim()) params.set('search', query.search.trim())
  if (query.perPage) params.set('perPage', String(query.perPage))
  if (query.page) params.set('page', String(query.page))
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

export async function fetchCertificateRequests(query: CertificateRequestsQuery = {}): Promise<Paginated<AdminCertificateRequest>> {
  return apiFetch<Paginated<AdminCertificateRequest>>(`/admin/certificate-requests${toQueryString(query)}`)
}

/** The request itself, not wrapped in `data`. */
export async function fetchCertificateRequest(id: string): Promise<AdminCertificateRequest> {
  return apiFetch<AdminCertificateRequest>(`/admin/certificate-requests/${id}`)
}

export async function issueCertificateRequest(id: string, registerEntryId: string): Promise<AdminCertificateRequest> {
  return apiFetch<AdminCertificateRequest>(`/admin/certificate-requests/${id}/issue`, {
    method: 'POST',
    body: JSON.stringify({ registerEntryId }),
  })
}

export async function declineCertificateRequest(id: string, reason: string): Promise<AdminCertificateRequest> {
  return apiFetch<AdminCertificateRequest>(`/admin/certificate-requests/${id}/decline`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  })
}
