import { apiFetch } from './client'

/** Uploads a file the office holds (for example a walk-in's paper certificate); returns the stored path to attach it to a booking. */
export async function uploadDocument(file: File): Promise<{ url: string }> {
  const body = new FormData()
  body.append('file', file)
  return apiFetch<{ url: string }>('/documents', { method: 'POST', body })
}
