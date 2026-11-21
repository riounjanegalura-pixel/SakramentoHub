import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, getAuthToken, setAuthToken } from './client'
import { fetchCurrentUser } from './users'

const respond = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  localStorage.clear()
})

describe('fetchCurrentUser', () => {
  it('keeps the saved token and tries again when the server is only slow or failing', async () => {
    vi.stubEnv('VITE_API_URL', 'http://api.test')
    setAuthToken('good-token')
    const fetchMock = vi.fn().mockResolvedValueOnce(respond(502, {})).mockResolvedValueOnce(respond(200, { id: 'u1', fullName: 'Ana' }))
    vi.stubGlobal('fetch', fetchMock)

    const user = await fetchCurrentUser([0, 0])

    expect(user).toMatchObject({ id: 'u1' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(getAuthToken()).toBe('good-token')
  })

  it('does not drop the token when the server stays down', async () => {
    vi.stubEnv('VITE_API_URL', 'http://api.test')
    setAuthToken('good-token')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(503, {})))

    expect(await fetchCurrentUser([0, 0])).toBeNull()
    expect(getAuthToken()).toBe('good-token')
  })

  it('signs out only on a 401, and forgets the token', async () => {
    vi.stubEnv('VITE_API_URL', 'http://api.test')
    setAuthToken('old-token')
    const fetchMock = vi.fn().mockResolvedValue(respond(401, { message: 'Unauthenticated.' }))
    vi.stubGlobal('fetch', fetchMock)

    expect(await fetchCurrentUser([0, 0])).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(getAuthToken()).toBeNull()
    expect(new ApiError('x', 401)).toBeInstanceOf(Error)
  })
})
