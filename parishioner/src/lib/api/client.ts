const TOKEN_KEY = 'sakramentohub_api_token'

export function setAuthToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function clearAuthToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

/** A failed API call. `fieldErrors` is Laravel's `errors` object (key → messages) for a 422, else empty. */
export class ApiError extends Error {
  status: number
  fieldErrors: Record<string, string[]>

  constructor(message: string, status: number, fieldErrors: Record<string, string[]> = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.fieldErrors = fieldErrors
  }
}

function fieldErrorsOf(body: unknown): Record<string, string[]> {
  const raw = (body as { errors?: unknown } | null)?.errors
  if (!raw || typeof raw !== 'object') return {}
  return Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, (Array.isArray(value) ? value : [value]).map(String)]))
}

function baseUrl(): string {
  const url = import.meta.env.VITE_API_URL as string | undefined
  if (!url) throw new Error('VITE_API_URL is not set')
  return url
}

/** Shared request/error-handling core for apiFetch (JSON), apiFetchText
 * (raw text, e.g. the certificate HTML), and apiFetchBlob (a private file
 * like a receipt or prerequisite document) — the only difference between
 * them is how a successful response body gets parsed, so that's the one
 * thing each caller supplies. */
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
    throw new ApiError(message, response.status, fieldErrorsOf(body))
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

/** Like apiFetch, but for endpoints (the certificate download) that respond
 * with a raw body — text/html here — rather than JSON. */
export async function apiFetchText(path: string, init: RequestInit = {}): Promise<string> {
  const response = await request(path, init, {})

  return response.text()
}

/** For endpoints serving a private file (receipt, prerequisite document) —
 * these require the Authorization header this client attaches, which a
 * plain <img src>/<a href> can't send. Pair with useAuthenticatedBlobUrl to
 * turn the result into something an <img>/<a> CAN use (a blob: URL). */
export async function apiFetchBlob(path: string, init: RequestInit = {}): Promise<Blob> {
  const response = await request(path, init, {})

  return response.blob()
}
