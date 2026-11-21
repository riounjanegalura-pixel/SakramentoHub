import { describe, it, expect, beforeEach, vi } from 'vitest'
import { persistWalkIn, submitWalkInDraft } from './deskActions'
import { useDeskStore } from '../../stores/desk-store'

const createWalkIn = vi.fn()
const updateWalkIn = vi.fn()
const submitWalkIn = vi.fn()
vi.mock('../../lib/data/walkIns', () => ({
  createWalkIn: (...a: unknown[]) => createWalkIn(...a),
  updateWalkIn: (...a: unknown[]) => updateWalkIn(...a),
  submitWalkIn: (...a: unknown[]) => submitWalkIn(...a),
}))

const snapshot = {
  sacrament: 'house-blessing' as const,
  formData: { bookingFor: 'other', relationship: 'relative', propertyOwner: 'Nena' } as Record<string, unknown>,
  appointmentDate: '2026-11-10' as string | null,
  appointmentStart: '10:00' as string | null,
  editingId: null as string | null,
}

describe('desk actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useDeskStore.getState().reset()
    useDeskStore.getState().setContact({ fullName: 'Lola Nena Cruz', phone: '09171234567', email: '' })
    createWalkIn.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 10))
      return { id: 'w1' }
    })
    updateWalkIn.mockResolvedValue({ id: 'w1' })
  })

  it('creates the draft once and updates it afterwards, even when asked twice at the same moment', async () => {
    const [a, b] = await Promise.all([persistWalkIn(snapshot), persistWalkIn({ ...snapshot, appointmentStart: '11:00' })])
    expect(a.id).toBe('w1')
    expect(b.id).toBe('w1')
    expect(createWalkIn).toHaveBeenCalledTimes(1)
    expect(updateWalkIn).toHaveBeenCalledTimes(1)
    expect(updateWalkIn.mock.calls[0][0]).toBe('w1')
    expect(useDeskStore.getState().draftId).toBe('w1')
  })

  it('sends the contact with its relationship, a null email when blank, and only a confirmed account link', async () => {
    await persistWalkIn(snapshot)
    expect(createWalkIn).toHaveBeenCalledWith('house-blessing', {
      contact: { fullName: 'Lola Nena Cruz', phone: '09171234567', email: null, relationship: 'relative' },
      linkUserId: null,
      formData: snapshot.formData,
      appointmentDate: '2026-11-10',
      appointmentStart: '10:00',
    })

    useDeskStore.getState().setLinkedAccount({ id: 'acct-1', fullName: 'Maria Santos', email: 'maria@example.com' })
    await persistWalkIn(snapshot)
    expect(updateWalkIn.mock.calls[0][1].linkUserId).toBe('acct-1')
  })

  it('records "self" as the relationship when the person at the counter receives it, and null when not chosen yet', async () => {
    await persistWalkIn({ ...snapshot, formData: { bookingFor: 'self', relationship: null } })
    expect(createWalkIn.mock.calls[0][1].contact.relationship).toBe('self')
    await persistWalkIn({ ...snapshot, formData: {} })
    expect(updateWalkIn.mock.calls[0][1].contact.relationship).toBeNull()
  })

  it('updates the returned walk-in being edited instead of creating one', async () => {
    await persistWalkIn({ ...snapshot, editingId: 'ret-1' })
    expect(createWalkIn).not.toHaveBeenCalled()
    expect(updateWalkIn.mock.calls[0][0]).toBe('ret-1')
  })

  it('refuses to save without a contact', async () => {
    useDeskStore.getState().setContact(null)
    await expect(persistWalkIn(snapshot)).rejects.toThrow(/contact/i)
    await expect(persistWalkIn(snapshot)).rejects.toThrow(/contact/i) // a failure does not jam the queue
  })

  it('submits with the waiver the desk set', async () => {
    useDeskStore.getState().setWaiver(true, 'Moving in tomorrow')
    submitWalkIn.mockResolvedValue({ id: 'w1' })
    await submitWalkInDraft('w1')
    expect(submitWalkIn).toHaveBeenCalledWith('w1', { waiveLeadTime: true, waiveReason: 'Moving in tomorrow' })
  })
})
