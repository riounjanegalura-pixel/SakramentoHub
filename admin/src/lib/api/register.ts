import { apiFetch, apiFetchText } from './client'
import type {
  Paginated,
  RegisterDetail,
  RegisterEntry,
  RegisterEntryDetail,
  RegisterSource,
  RegisterStatus,
  TranscribableSacrament,
} from '../types'

export interface RegisterQuery {
  sacrament?: string
  year?: string
  status?: RegisterStatus | ''
  source?: RegisterSource | ''
  search?: string
  perPage?: number
  page?: number
}

function toQueryString(query: RegisterQuery): string {
  const params = new URLSearchParams()
  if (query.sacrament) params.set('sacrament', query.sacrament)
  if (query.year) params.set('year', query.year)
  if (query.status) params.set('status', query.status)
  if (query.source) params.set('source', query.source)
  // Trimmed, and an empty search is dropped rather than sent as `search=`.
  if (query.search?.trim()) params.set('search', query.search.trim())
  if (query.perPage) params.set('perPage', String(query.perPage))
  if (query.page) params.set('page', String(query.page))
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

export async function fetchRegister(query: RegisterQuery = {}): Promise<Paginated<RegisterEntry>> {
  return apiFetch<Paginated<RegisterEntry>>(`/admin/register${toQueryString(query)}`)
}

/** Unlike the list, this answer is the entry itself, not wrapped in `data`. */
export async function fetchRegisterEntry(id: string): Promise<RegisterEntryDetail> {
  return apiFetch<RegisterEntryDetail>(`/admin/register/${id}`)
}

/** The certificate HTML; open it through a blob: URL because the route needs the bearer token. */
export async function fetchRegisterCertificateHtml(id: string): Promise<string> {
  return apiFetchText(`/admin/register/${id}/certificate`)
}

export interface TranscribeInput {
  sacrament: TranscribableSacrament
  ceremonyDate: string
  subjectName: string
  minister: string
  details: RegisterDetail[]
  bookNo: string
  pageNo: string
  lineNo?: string
  /** Sent as true only after staff chose "Add anyway" on a same-name-and-date warning. */
  confirmDuplicate?: boolean
}

/** The next book and page numbers, counted on automatically from the register. */
export async function fetchNextNumbers(): Promise<{ bookNo: string; pageNo: string }> {
  return apiFetch<{ bookNo: string; pageNo: string }>('/admin/register/next-numbers')
}

export async function transcribeEntry(input: TranscribeInput): Promise<RegisterEntry> {
  return apiFetch<RegisterEntry>('/admin/register', { method: 'POST', body: JSON.stringify(input) })
}

export interface CorrectInput {
  reason: string
  subjectName?: string
  ceremonyDate?: string
  minister?: string
  details?: RegisterDetail[]
}

/** Admin only. */
export async function correctEntry(id: string, input: CorrectInput): Promise<RegisterEntry> {
  return apiFetch<RegisterEntry>(`/admin/register/${id}`, { method: 'PATCH', body: JSON.stringify(input) })
}

export interface PaperReferenceInput {
  bookNo: string | null
  pageNo: string | null
  lineNo: string | null
}

/** Staff and admin; null clears a part. */
export async function setPaperReference(id: string, input: PaperReferenceInput): Promise<RegisterEntry> {
  return apiFetch<RegisterEntry>(`/admin/register/${id}/paper-reference`, { method: 'PATCH', body: JSON.stringify(input) })
}

/** Admin only. */
export async function revokeEntry(id: string, reason: string): Promise<RegisterEntry> {
  return apiFetch<RegisterEntry>(`/admin/register/${id}/revoke`, { method: 'POST', body: JSON.stringify({ reason }) })
}

/** Admin only. */
export async function reinstateEntry(id: string, reason: string): Promise<RegisterEntry> {
  return apiFetch<RegisterEntry>(`/admin/register/${id}/reinstate`, { method: 'POST', body: JSON.stringify({ reason }) })
}
