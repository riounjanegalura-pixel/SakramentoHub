const TOKEN_KEY = 'sakramentohub_admin_api_token'

export function setAuthToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function clearAuthToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

function baseUrl(): string {
  const url = import.meta.env.VITE_API_URL as string | undefined
  if (!url) throw new Error('VITE_API_URL is not set')
  return url
}

/** A failed request. `message` is the server's `{message}` (what screens show); `status` and `body`
 * keep the rest of the answer for the few callers that need it: a 422's per-field `errors`, a 409's
 * `duplicates`. Existing callers that only read `.message` are unaffected. */
export class ApiError extends Error {
  readonly status: number
  readonly body: Record<string, unknown> | null

  constructor(message: string, status: number, body: Record<string, unknown> | null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }

  /** Laravel validation errors as `{ field: first message }`; empty when there are none. */
  get fieldErrors(): Record<string, string> {
    const errors = this.body?.errors
    if (!errors || typeof errors !== 'object') return {}
    return Object.fromEntries(
      Object.entries(errors as Record<string, unknown>).map(([k, v]) => [k, Array.isArray(v) ? String(v[0]) : String(v)]),
    )
  }
}

/** Shared request/error-handling core for both apiFetch (JSON) and
 * apiFetchText (raw body) — the only difference between the two is how a
 * successful response body gets parsed, so that's the one thing callers
 * supply. */
async function request(path: string, init: RequestInit, extraHeaders: Record<string, string>): Promise<Response> {
  const token = getAuthToken()
  const headers: Record<string, string> = {
    ...extraHeaders,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((init.headers as Record<string, string>) ?? {}),
  }

  const response = await fetch(`${baseUrl()}${path}`, { ...init, headers })

  if (!response.ok) {
    const body = await response.json().catch(() => null)
    const message = body?.message ?? `Request failed: ${response.status}`
    throw new ApiError(message, response.status, body && typeof body === 'object' ? body : null)
  }

  return response
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await request(path, init, {
    Accept: 'application/json',
    ...(init.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
  })

  if (response.status === 204) return undefined as T

  return response.json() as Promise<T>
}

/** Like apiFetch, but for endpoints (e.g. the certificate download) that
 * respond with a raw body — text/html here — rather than JSON. */
export async function apiFetchText(path: string, init: RequestInit = {}): Promise<string> {
  const response = await request(path, init, {})

  return response.text()
}

/** For endpoints serving a private file (a prerequisite document) —
 * these require the Authorization header this client attaches, which a
 * plain <img src>/<a href> can't send. Pair with useAuthenticatedBlobUrl to
 * turn the result into something an <img>/<a> CAN use (a blob: URL). */
export async function apiFetchBlob(path: string, init: RequestInit = {}): Promise<Blob> {
  const response = await request(path, init, {})

  return response.blob()
}
