import { apiFetch } from './client'
import type { AuditLogEntry, Paginated } from '../types'

export interface AuditLogFilters {
  area?: string
  q?: string
  /** YYYY-MM-DD, parish-local, inclusive. */
  from?: string
  to?: string
}

export async function fetchAuditLog(page = 1, filters: AuditLogFilters = {}): Promise<Paginated<AuditLogEntry>> {
  const params = new URLSearchParams()
  if (page > 1) params.set('page', String(page))
  if (filters.area) params.set('area', filters.area)
  if (filters.q) params.set('q', filters.q)
  if (filters.from) params.set('from', filters.from)
  if (filters.to) params.set('to', filters.to)
  const qs = params.toString()
  return apiFetch<Paginated<AuditLogEntry>>(`/admin/audit-log${qs ? `?${qs}` : ''}`)
}

export interface AuditSummary {
  total: number
  days: Array<{ date: string; count: number }>
  people: Array<{ name: string; count: number }>
}

/** The side panel: actions per day for the last 14 days, and who did the most. */
export async function fetchAuditSummary(): Promise<AuditSummary> {
  return apiFetch<AuditSummary>('/admin/audit-log/summary')
}
