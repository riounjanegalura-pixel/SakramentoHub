import { apiFetch, apiFetchBlob } from './client'

/** GET /me/export — the RA 10173 self-service data-access right. Returns
 * the raw JSON body as a Blob so the caller can trigger a real file
 * download, exactly like the existing receipt/certificate download flows
 * (apiFetchBlob is the same helper those already use). */
export async function exportMyData(): Promise<Blob> {
  return apiFetchBlob('/me/export')
}

/** DELETE /me — the RA 10173 self-service deletion right. Requires the
 * current password re-entered as a safety check, same pattern as
 * changePassword. On success the backend has already revoked every Sanctum
 * token, so the caller must still clear local session state and redirect —
 * this function only does the network call. */
export async function deleteAccount(currentPassword: string): Promise<void> {
  await apiFetch<void>('/me', {
    method: 'DELETE',
    body: JSON.stringify({ currentPassword }),
  })
}
