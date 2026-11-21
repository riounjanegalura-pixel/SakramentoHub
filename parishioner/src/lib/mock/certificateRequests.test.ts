import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  cancelCertificateRequest, createCertificateRequest, fetchMyCertificateRequests, resetMockCertificateRequests,
} from './certificateRequests'
import type { CertificateRequestInput } from '../types'

vi.mock('./latency', async (orig) => ({ ...(await orig<object>()), simulateLatency: async () => {} }))

const input = (over: Partial<CertificateRequestInput> = {}): CertificateRequestInput => ({
  sacrament: 'baptism', personName: 'Ana Reyes', sacramentDateText: 'March 1998', relationship: 'self',
  purpose: 'Passport', idUrl: '/documents/u1/id.jpg', ...over,
})

describe('mock certificate requests', () => {
  beforeEach(() => resetMockCertificateRequests())

  it('starts empty, creates a submitted request with a CERT reference and lists newest first', async () => {
    expect(await fetchMyCertificateRequests()).toEqual([])
    const a = await createCertificateRequest(input())
    const b = await createCertificateRequest(input({ personName: 'Ben' }))
    expect(a.referenceNumber).toMatch(/^CERT-\d{8}-[A-Z0-9]{4}$/)
    expect(a.status).toBe('submitted')
    expect((await fetchMyCertificateRequests()).map((r) => r.id)).toEqual([b.id, a.id])
  })

  it('refuses the sixth open request with the server message, but cancelled ones do not count', async () => {
    const first = await createCertificateRequest(input())
    for (let i = 0; i < 4; i++) await createCertificateRequest(input())
    await expect(createCertificateRequest(input())).rejects.toThrow('You already have 5 open requests.')
    await cancelCertificateRequest(first.id)
    await expect(createCertificateRequest(input())).resolves.toBeTruthy()
  })

  it('requires the letter for a representative', async () => {
    await expect(createCertificateRequest(input({ relationship: 'representative' }))).rejects.toMatchObject({
      fieldErrors: { letterUrl: expect.any(Array) },
    })
    await expect(createCertificateRequest(input({ relationship: 'representative', letterUrl: '/documents/u1/l.pdf' }))).resolves.toBeTruthy()
  })

  it('cancels only a submitted request', async () => {
    const a = await createCertificateRequest(input())
    expect((await cancelCertificateRequest(a.id)).status).toBe('cancelled')
    await expect(cancelCertificateRequest(a.id)).rejects.toThrow('Only a request that is still waiting can be cancelled.')
  })
})
