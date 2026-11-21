import { describe, it, expect, beforeEach, vi } from 'vitest'
import { addWalletDocumentByUrl, addWalletDocumentFile, deleteWalletDocument, fetchWallet, resetMockWallet } from './wallet'
import { fetchMyRegisterEntries } from './registerEntries'

vi.mock('./latency', async (orig) => ({ ...(await orig<object>()), simulateLatency: async () => {} }))

describe('mock wallet', () => {
  beforeEach(() => resetMockWallet())

  it('starts empty, as does the certificate list', async () => {
    expect(await fetchWallet()).toEqual([])
    expect(await fetchMyRegisterEntries()).toEqual([])
  })

  it('adds, lists newest first, and deletes', async () => {
    const a = await addWalletDocumentByUrl('/documents/u1/a.pdf', 'birth_certificate', 'Ana')
    const b = await addWalletDocumentByUrl('/documents/u1/b.pdf', 'cenomar', 'Ben')
    expect((await fetchWallet()).map((d) => d.id)).toEqual([b.id, a.id])
    await deleteWalletDocument(a.id)
    expect((await fetchWallet()).map((d) => d.id)).toEqual([b.id])
  })

  it('returns the existing row when the same fileUrl is added again', async () => {
    const a = await addWalletDocumentByUrl('/documents/u1/a.pdf', 'birth_certificate', 'Ana')
    const again = await addWalletDocumentByUrl('/documents/u1/a.pdf', 'cenomar', 'Someone else')
    expect(again.id).toBe(a.id)
    expect(again.kind).toBe('birth_certificate')
    expect(await fetchWallet()).toHaveLength(1)
  })

  it('refuses the 31st document with the server message', async () => {
    for (let i = 0; i < 30; i++) await addWalletDocumentByUrl(`/documents/u1/${i}.pdf`, 'other', 'Ana')
    await expect(addWalletDocumentFile(new File(['x'], 'x.pdf'), 'other', 'Ana')).rejects.toThrow(
      'Your wallet is full (30 documents). Delete one to add another.',
    )
    await expect(addWalletDocumentByUrl('/documents/u1/new.pdf', 'other', 'Ana')).rejects.toThrow(/wallet is full/)
    // A repeat of an existing address is not a 31st document.
    await expect(addWalletDocumentByUrl('/documents/u1/0.pdf', 'other', 'Ana')).resolves.toBeTruthy()
  })
})
