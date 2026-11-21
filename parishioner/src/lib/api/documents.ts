import { apiFetch, apiFetchBlob } from './client'

/** Uploads a prerequisite document (baptismal certificate, marriage license,
 * etc). See docs/api-contract.md's "Documents" section for why this is
 * deliberately not booking-scoped: the wizard's draft booking doesn't exist
 * server-side until the final review step, so a document field may be filled
 * in long before there's a booking id to attach it to. */
export async function uploadDocument(file: File): Promise<{ url: string }> {
  const formData = new FormData()
  formData.append('file', file)
  return apiFetch<{ url: string }>('/documents', { method: 'POST', body: formData })
}

/** A stored file (`/documents/:userId/:filename`) needs the bearer token, so it is fetched as a blob. */
export async function fetchDocumentFile(url: string): Promise<Blob> {
  return apiFetchBlob(url)
}
