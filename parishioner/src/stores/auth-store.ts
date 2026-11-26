import { create } from 'zustand'
import type { User } from '../lib/types'
import { clearCurrentUser } from '../lib/data/users'
import { logout as apiLogout } from '../lib/data/auth'
import { queryClient } from '../lib/query-client'
import { clearPersistedQueries } from '../lib/query-persist'
import { useBookingStore } from './booking-store'

interface AuthState {
  user: User | null
  // True until useAuthBootstrap's initial fetchCurrentUser() call settles.
  // ProtectedRoute reads this so a hard-refreshed, actually-logged-in user
  // isn't bounced to /login for the one frame before the session rehydrates.
  isBootstrapping: boolean
  setUser: (user: User) => void
  updateUser: (patch: Partial<User>) => void
  finishBootstrap: () => void
  logout: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isBootstrapping: true,
  setUser: (user) => {
    // An unfinished booking stays with the person who started it.
    useBookingStore.getState().adoptOwner(user.id)
    set({ user })
  },
  updateUser: (patch) => set((s) => (s.user ? { user: { ...s.user, ...patch } } : s)),
  finishBootstrap: () => set({ isBootstrapping: false }),
  logout: async () => {
    try {
      await apiLogout()
    } catch {
      // A failed server call (expired token, offline) must not keep this computer signed in; the local session is cleared below.
    } finally {
      clearCurrentUser()
      set({ user: null })
      // An unfinished booking must not be there for the next person on a shared computer.
      useBookingStore.getState().reset()
      useBookingStore.persist.clearStorage()
      // Nothing cached for this person may reach the next one on a shared computer.
      queryClient.clear()
      clearPersistedQueries()
    }
  },
}))
