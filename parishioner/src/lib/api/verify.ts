import { apiFetch } from './client'
import type { CertificateVerification } from '../types'

/** Public: no session needed. A miss is a 404 ApiError, too many tries a 429. */
export async function verifyCertificate(number: string, code: string): Promise<CertificateVerification> {
  return apiFetch<CertificateVerification>('/verify', { method: 'POST', body: JSON.stringify({ number, code }) })
}
