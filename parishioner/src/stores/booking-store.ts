import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
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
} satisfies Partial<BookingState>

/**
 * Persisted to sessionStorage (not localStorage): a booking-in-progress
 * should survive an accidental refresh or a mobile PWA getting backgrounded
 * and reloaded by the OS mid-wizard — without persistence, `sacrament`
 * resets to null on any reload, steps 1-4 still silently accept input (they
 * don't read `sacrament`), and the Review step then renders completely
 * blank (`if (!sacrament) return null`) with no explanation. sessionStorage
 * rather than localStorage so an abandoned draft doesn't linger across
 * browser sessions/days — it clears with the tab, matching how long a
 * half-filled booking form should realistically stay valid.
 */
export const useBookingStore = create<BookingState>()(
  persist(
    (set) => ({
      ...initialState,
      startBooking: (sacrament) => set({ ...initialState, sacrament }),
      setSacrament: (sacrament) => set({ sacrament }),
      updateFormData: (patch) => set((s) => ({ formData: { ...s.formData, ...patch } })),
      setBookingId: (bookingId) => set({ bookingId }),
      setAppointment: (appointmentDate, appointmentStart) => set({ appointmentDate, appointmentStart }),
      setEditingBookingId: (editingBookingId) => set({ editingBookingId }),
      reset: () => set(initialState),
    }),
    {
      name: 'sakramentohub_booking_draft',
      storage: createJSONStorage(() => sessionStorage),
      // v2: the appointment moved out of formData into its own fields.
      // v3: editingBookingId added for resubmitting a returned booking.
      // v4: the wizard's URL is the step and GCash is the only payment, so
      //     `step` and `paymentMethod` are dropped.
      version: 4,
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
        } as BookingState
      },
      partialize: (state) => ({
        sacrament: state.sacrament,
        formData: state.formData,
        bookingId: state.bookingId,
        appointmentDate: state.appointmentDate,
        appointmentStart: state.appointmentStart,
        editingBookingId: state.editingBookingId,
      }),
    },
  ),
)
