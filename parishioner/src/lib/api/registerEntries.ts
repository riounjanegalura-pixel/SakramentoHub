import { apiFetch, apiFetchText } from './client'
import type { RegisterEntrySummary } from '../types'

export async function fetchMyRegisterEntries(): Promise<RegisterEntrySummary[]> {
  return apiFetch<RegisterEntrySummary[]>('/register-entries')
}

export async function fetchRegisterEntryCertificateHtml(id: string): Promise<string> {
  return apiFetchText(`/register-entries/${id}/certificate`)
}
