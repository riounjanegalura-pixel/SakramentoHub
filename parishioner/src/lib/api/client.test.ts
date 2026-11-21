import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { apiFetch, apiFetchText, apiFetchBlob, setAuthToken, getAuthToken, ApiError } from './client'

describe('apiFetch', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    localStorage.clear()
    globalThis.fetch = vi.fn()
    // apiFetch()'s baseUrl() throws unless VITE_API_URL is set — stub it here
    // rather than relying on a global .env.test, so this is the only test
    // file that runs in "API mode"; every other test keeps the suite's
    // default mock-mode behavior (see lib/data/*.ts's env-flag switch).
    vi.stubEnv('VITE_API_URL', 'http://localhost:8000/api')
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.unstubAllEnvs()
  })

  it('attaches the Authorization header when a token is set', async () => {
    setAuthToken('abc123')
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    )

    await apiFetch('/me')

    const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer abc123')
  })

  it('omits the Authorization header when no token is set', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    )

    await apiFetch('/services')

    const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined()
  })

  it('throws with the response body message on a non-2xx response', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ message: 'Failed to log in' }), { status: 422 }),
    )

    await expect(apiFetch('/login', { method: 'POST' })).rejects.toThrow('Failed to log in')
  })

  it('throws an ApiError carrying the status and the 422 field errors', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(
        JSON.stringify({
          message: 'The formData.deathCertificate field is required.',
          errors: { 'formData.deathCertificate': ['Upload the death certificate'], appointmentStart: ['That time is no longer available.'] },
        }),
        { status: 422 },
      ),
    )

    const error = await apiFetch('/bookings/b1/submit', { method: 'PATCH' }).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toBeInstanceOf(Error)
    const api = error as ApiError
    expect(api.status).toBe(422)
    expect(api.message).toBe('The formData.deathCertificate field is required.')
    expect(api.fieldErrors).toEqual({
      'formData.deathCertificate': ['Upload the death certificate'],
      appointmentStart: ['That time is no longer available.'],
    })
  })

  it('gives an ApiError with no field errors when the body has none', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ message: 'Nope' }), { status: 404 }),
    )
    const error = (await apiFetch('/admin/parishioners/lookup').catch((e: unknown) => e)) as ApiError
    expect(error.status).toBe(404)
    expect(error.fieldErrors).toEqual({})
  })

  it('persists the token across getAuthToken/setAuthToken', () => {
    setAuthToken('xyz789')
    expect(getAuthToken()).toBe('xyz789')
  })

  it('apiFetchText returns the raw body and still attaches auth', async () => {
    setAuthToken('cert-token')
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response('<html>certificate</html>', { status: 200 }),
    )

    const html = await apiFetchText('/bookings/1/certificate')

    expect(html).toBe('<html>certificate</html>')
    const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer cert-token')
  })

  it('apiFetchBlob returns a Blob and still attaches auth', async () => {
    setAuthToken('file-token')
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response('fake-image-bytes', { status: 200 }),
    )

    const blob = await apiFetchBlob('/documents/1/birth-certificate.pdf')

    // Node's Blob and jsdom's Blob are different classes on Node 20, so check the content.
    expect(await blob.text()).toBe('fake-image-bytes')
    const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer file-token')
  })
})
