import { createWalkIn, updateWalkIn, submitWalkIn } from '../../lib/data/walkIns'
import { useDeskStore } from '../../stores/desk-store'
import type { DeskBooking, Sacrament } from '../../lib/types'

export interface DraftSnapshot {
  sacrament: Sacrament
  formData: Record<string, unknown>
  appointmentDate: string | null
  appointmentStart: string | null
  /** The returned walk-in being edited, if any. */
  editingId: string | null
}

/** Who the person at the counter is to the one receiving the sacrament, from the contact step's answers ('self' or a relationship value). */
export function deskRelationship(formData: Record<string, unknown>): string | null {
  if (formData.bookingFor === 'self') return 'self'
  return typeof formData.relationship === 'string' && formData.relationship !== '' ? formData.relationship : null
}

/**
 * Walk-in creation is not idempotent (unlike an online draft, which the server upserts per user and
 * sacrament), and the Review step quotes the fee by saving. Saves therefore run one after another:
 * the first creates the draft, every later one updates it.
 */
let queue: Promise<unknown> = Promise.resolve()

export function persistWalkIn(snapshot: DraftSnapshot): Promise<DeskBooking> {
  const run = queue.then(() => save(snapshot))
  queue = run.catch(() => undefined)
  return run
}

async function save(snapshot: DraftSnapshot): Promise<DeskBooking> {
  const desk = useDeskStore.getState()
  if (!desk.contact) throw new Error('Enter the walk-in contact first.')
  const body = {
    contact: {
      fullName: desk.contact.fullName,
      phone: desk.contact.phone,
      email: desk.contact.email || null,
      relationship: deskRelationship(snapshot.formData),
    },
    // Only an account the desk confirmed; an email alone never links.
    linkUserId: desk.linkedAccount?.id ?? null,
    formData: snapshot.formData,
    appointmentDate: snapshot.appointmentDate,
    appointmentStart: snapshot.appointmentStart,
  }
  const existing = desk.draftId ?? snapshot.editingId
  if (existing) return updateWalkIn(existing, body)
  const created = await createWalkIn(snapshot.sacrament, body)
  useDeskStore.getState().setDraftId(created.id)
  return created
}

export function submitWalkInDraft(id: string): Promise<DeskBooking> {
  const { waiveLeadTime, waiveReason } = useDeskStore.getState()
  return submitWalkIn(id, { waiveLeadTime, waiveReason })
}
