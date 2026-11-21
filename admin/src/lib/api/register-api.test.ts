import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as register from './register'
import { ApiError } from './client'

const fetchMock = vi.fn()

function respond(body: unknown = {}, status = 200) {
  fetchMock.mockImplementation(() =>
    Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })),
  )
}

function last() {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit | undefined]
  return {
    url: url.replace('http://api.test/api', ''),
    method: init?.method ?? 'GET',
    body: init?.body ? JSON.parse(String(init.body)) : undefined,
  }
}

beforeEach(() => {
  vi.stubEnv('VITE_API_URL', 'http://api.test/api')
  fetchMock.mockReset()
  respond()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('register api', () => {
  it('sends only the filters that are set, trimming the search', async () => {
    await register.fetchRegister({ sacrament: 'baptism', year: '1998', status: 'revoked', source: '', search: '  cruz ', page: 2 })
    expect(last()).toMatchObject({ method: 'GET', url: '/admin/register?sacrament=baptism&year=1998&status=revoked&search=cruz&page=2' })
    await register.fetchRegister({ search: '   ' })
    expect(last().url).toBe('/admin/register')
  })

  const transcribed: register.TranscribeInput = { sacrament: 'baptism', ceremonyDate: '1998-05-02', subjectName: 'A', minister: 'Fr', details: [], bookNo: '4', pageNo: '12', confirmDuplicate: true }

  it.each([
    ['fetchRegisterEntry', () => register.fetchRegisterEntry('r1'), 'GET', '/admin/register/r1', undefined],
    ['transcribeEntry', () => register.transcribeEntry(transcribed), 'POST', '/admin/register', transcribed],
    ['correctEntry', () => register.correctEntry('r1', { reason: 'Typo', subjectName: 'B' }), 'PATCH', '/admin/register/r1', { reason: 'Typo', subjectName: 'B' }],
    ['setPaperReference', () => register.setPaperReference('r1', { bookNo: '4', pageNo: null, lineNo: null }), 'PATCH', '/admin/register/r1/paper-reference', { bookNo: '4', pageNo: null, lineNo: null }],
    ['revokeEntry', () => register.revokeEntry('r1', 'Wrong person'), 'POST', '/admin/register/r1/revoke', { reason: 'Wrong person' }],
    ['reinstateEntry', () => register.reinstateEntry('r1', 'Mistake'), 'POST', '/admin/register/r1/reinstate', { reason: 'Mistake' }],
  ])('%s', async (_name, call, method, url, body) => {
    await call()
    expect(last()).toMatchObject({ method, url, body })
  })

  it('keeps a 422 field map and a 409 duplicates list on the error, with the server message as its message', async () => {
    respond({ message: 'Invalid.', errors: { bookNo: ['The book no field is required.'], 'details.0.label': ['Bad.'] } }, 422)
    const e422 = await register.transcribeEntry(transcribed).catch((e) => e)
    expect(e422).toBeInstanceOf(ApiError)
    expect(e422.message).toBe('Invalid.')
    expect(e422.status).toBe(422)
    expect(e422.fieldErrors).toEqual({ bookNo: 'The book no field is required.', 'details.0.label': 'Bad.' })

    respond({ message: 'Already there.', duplicates: [{ id: 'r9', registerNumber: 'BAP-1998-0001' }] }, 409)
    const e409 = await register.transcribeEntry(transcribed).catch((e) => e)
    expect(e409.status).toBe(409)
    expect(e409.body).toMatchObject({ duplicates: [{ id: 'r9', registerNumber: 'BAP-1998-0001' }] })
  })
})
