import { create } from 'zustand'
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware'
import type { Sacrament } from '../lib/types'

interface BookingState {
  sacrament: Sacrament | null
  formData: Record<string, unknown>
  /** The draft's real id, once the wizard has saved it. */
  bookingId: string | null
  appointmentDate: string | null
  appointmentStart: string | null
  /** Set while the wizard edits a returned booking; Review then updates it in place. */
  editingBookingId: string | null
  /** Who started this draft (the signed-in user's id); null until someone signs in. */
  ownerId: string | null
  /** Called on sign-in: the owner keeps their draft, anyone else gets a clean slate. */
  adoptOwner: (userId: string) => void
  startBooking: (sacrament: Sacrament) => void
  /** Fills in `sacrament` without touching anything else — unlike
   * startBooking, which resets the whole draft. A safety net for a cold
   * deep-link straight into a wizard step, bypassing the screen that
   * normally calls startBooking first. */
  setSacrament: (sacrament: Sacrament) => void
  updateFormData: (patch: Record<string, unknown>) => void
  setBookingId: (id: string) => void
  setAppointment: (date: string | null, start: string | null) => void
  setEditingBookingId: (id: string | null) => void
  reset: () => void
}

const initialState = {
  sacrament: null,
  formData: {},
  bookingId: null,
  appointmentDate: null,
  appointmentStart: null,
  editingBookingId: null,
  ownerId: null,
} satisfies Partial<BookingState>

const KEY = 'sakramentohub_booking_draft'

/** How long an unfinished booking is kept. Each answer typed starts the week again. */
export const DRAFT_LIFETIME_MS = 7 * 86_400_000

/**
 * The draft lives in localStorage, not sessionStorage: a phone app (an installed PWA) that is closed, backgrounded or
 * reloaded by the system starts a new session, and a 80%-done form came back blank. It is thrown away after a week, and
 * on sign-out. A draft an older version left in sessionStorage is moved over once. Anything unreadable is ignored.
 */
const draftStorage: StateStorage = {
  getItem: (name) => {
    try {
      let raw = localStorage.getItem(name)
      if (raw === null) {
        raw = sessionStorage.getItem(name)
        if (raw !== null) {
          localStorage.setItem(name, raw)
          sessionStorage.removeItem(name)
        }
      }
      if (raw === null) return null
      const savedAt = (JSON.parse(raw) as { state?: { savedAt?: unknown } })?.state?.savedAt
      if (typeof savedAt === 'number' && Date.now() - savedAt > DRAFT_LIFETIME_MS) {
        localStorage.removeItem(name)
        return null
      }
      return raw
    } catch {
      return null
    }
  },
  setItem: (name, value) => {
    try {
      localStorage.setItem(name, value)
    } catch {
      // A full or blocked store only means the draft is not kept across a reload; the booking itself carries on.
    }
  },
  removeItem: (name) => {
    try {
      localStorage.removeItem(name)
      sessionStorage.removeItem(name)
    } catch {
      // Nothing to remove.
    }
  },
}

export const useBookingStore = create<BookingState>()(
  persist(
    (set) => ({
      ...initialState,
      startBooking: (sacrament) => set({ ...initialState, sacrament }),
      setSacrament: (sacrament) => set({ sacrament }),
      adoptOwner: (userId) =>
        set((s) => (s.ownerId !== null && s.ownerId !== userId ? { ...initialState, ownerId: userId } : { ownerId: userId })),
      updateFormData: (patch) => set((s) => ({ formData: { ...s.formData, ...patch } })),
      setBookingId: (bookingId) => set({ bookingId }),
      setAppointment: (appointmentDate, appointmentStart) => set({ appointmentDate, appointmentStart }),
      setEditingBookingId: (editingBookingId) => set({ editingBookingId }),
      reset: () => set(initialState),
    }),
    {
      name: KEY,
      storage: createJSONStorage(() => draftStorage),
      // v2: the appointment moved out of formData into its own fields.
      // v3: editingBookingId added for resubmitting a returned booking.
      // v4: the wizard's URL is the step and GCash is the only payment, so
      //     `step` and `paymentMethod` are dropped.
      // v5: kept in localStorage with the time it was last touched (savedAt) and the person it belongs to (ownerId).
      version: 5,
      migrate: (persisted) => {
        const { step: _step, paymentMethod: _paymentMethod, ...state } = (persisted ?? {}) as Partial<BookingState> & {
          step?: unknown
          paymentMethod?: unknown
        }
        return {
          ...state,
          appointmentDate: state.appointmentDate ?? null,
          appointmentStart: state.appointmentStart ?? null,
          editingBookingId: state.editingBookingId ?? null,
          ownerId: (state as { ownerId?: string | null }).ownerId ?? null,
        } as BookingState
      },
      partialize: (state) => ({
        sacrament: state.sacrament,
        formData: state.formData,
        bookingId: state.bookingId,
        appointmentDate: state.appointmentDate,
        appointmentStart: state.appointmentStart,
        editingBookingId: state.editingBookingId,
        ownerId: state.ownerId,
        savedAt: Date.now(),
      }),
    },
  ),
)
