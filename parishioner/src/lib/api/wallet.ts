import { apiFetch } from './client'
import type { WalletDocument, WalletKind } from '../types'

export async function fetchWallet(): Promise<WalletDocument[]> {
  return apiFetch<WalletDocument[]>('/wallet')
}

/** A new file. */
export async function addWalletDocumentFile(file: File, kind: WalletKind, personName: string): Promise<WalletDocument> {
  const form = new FormData()
  form.append('file', file)
  form.append('kind', kind)
  form.append('personName', personName)
  return apiFetch<WalletDocument>('/wallet', { method: 'POST', body: form })
}

/** A file already uploaded for a booking (an address in the caller's own folder). */
export async function addWalletDocumentByUrl(fileUrl: string, kind: WalletKind, personName: string): Promise<WalletDocument> {
  return apiFetch<WalletDocument>('/wallet', { method: 'POST', body: JSON.stringify({ fileUrl, kind, personName }) })
}

export async function deleteWalletDocument(id: string): Promise<void> {
  await apiFetch<void>(`/wallet/${id}`, { method: 'DELETE' })
}
