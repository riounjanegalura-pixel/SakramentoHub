import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { WalkInContact } from '../lib/types'

/** A parishioner account the desk confirmed to link a walk-in to. `email` is lower-cased, for spotting a later edit. */
export interface LinkedAccount {
  id: string
  fullName: string
  email: string
}

interface DeskData {
  contact: WalkInContact | null
  linkedAccount: LinkedAccount | null
  /** The walk-in booking on the server (a draft, or a returned walk-in being edited). */
  draftId: string | null
  waiveLeadTime: boolean
  waiveReason: string
}

interface DeskState extends DeskData {
  setContact: (contact: WalkInContact | null) => void
  setLinkedAccount: (account: LinkedAccount | null) => void
  setDraftId: (id: string | null) => void
  setWaiver: (on: boolean, reason: string) => void
  load: (data: Partial<DeskData>) => void
  reset: () => void
}

const initial: DeskData = { contact: null, linkedAccount: null, draftId: null, waiveLeadTime: false, waiveReason: '' }

/** State of the walk-in being entered at the desk. sessionStorage, like the booking draft: a refresh must not lose it. */
export const useDeskStore = create<DeskState>()(
  persist(
    (set) => ({
      ...initial,
      setContact: (contact) => set({ contact }),
      setLinkedAccount: (linkedAccount) => set({ linkedAccount }),
      setDraftId: (draftId) => set({ draftId }),
      setWaiver: (waiveLeadTime, waiveReason) => set({ waiveLeadTime, waiveReason }),
      load: (data) => set({ ...initial, ...data }),
      reset: () => set(initial),
    }),
    {
      name: 'sakramentohub_desk_draft',
      storage: createJSONStorage(() => sessionStorage),
      version: 1,
      partialize: (s) => ({
        contact: s.contact,
        linkedAccount: s.linkedAccount,
        draftId: s.draftId,
        waiveLeadTime: s.waiveLeadTime,
        waiveReason: s.waiveReason,
      }),
    },
  ),
)
