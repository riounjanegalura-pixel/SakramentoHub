import { describe, it, expect } from 'vitest'
import { verifyCertificate } from './verify'

describe('mock verifyCertificate', () => {
  it('finds a valid entry', async () => {
    const r = await verifyCertificate('BAP-2026-0001', 'ABCD-EFGH-JKMN')
    expect(r.status).toBe('valid')
    expect(r.registerNumber).toBe('BAP-2026-0001')
  })

  it('normalises the number and code like the server', async () => {
    const r = await verifyCertificate('  bap-2026-0001 ', 'abcd efgh-jkmn')
    expect(r.status).toBe('valid')
    expect((await verifyCertificate('BAP-2026-0001', 'abcdefghjkmn')).status).toBe('valid')
  })

  it('reports a withdrawn entry as revoked', async () => {
    expect((await verifyCertificate('BAP-2026-0002', 'ABCD-EFGH-JKMN')).status).toBe('revoked')
  })

  it('answers the same 404 for an unknown number or a wrong code', async () => {
    await expect(verifyCertificate('BAP-2026-0099', 'ABCD-EFGH-JKMN')).rejects.toMatchObject({ status: 404 })
    await expect(verifyCertificate('BAP-2026-0001', 'WRONG-WRONG-XXXX')).rejects.toMatchObject({ status: 404 })
  })
})
