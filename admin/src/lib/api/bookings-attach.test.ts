import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { attachLateDocument } from './bookings'

const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubEnv('VITE_API_URL', 'http://api.test/api')
  fetchMock.mockReset()
  fetchMock.mockImplementation(() =>
    Promise.resolve(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })),
  )
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('attachLateDocument', () => {
  it('encodes the document key in the URL', async () => {
    await attachLateDocument('b1', 'a/b c', '/documents/x.pdf')
    const [url] = fetchMock.mock.calls.at(-1) as [string]
    expect(url).toBe('http://api.test/api/admin/bookings/b1/documents/a%2Fb%20c/attach')
  })
})
