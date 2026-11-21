import { create } from 'zustand'
import type { User } from '../lib/types'
import { logout as apiLogout } from '../lib/data/auth'
import { queryClient } from '../lib/query-client'
import { clearPersistedQueries } from '../lib/query-persist'

interface AuthState {
  user: User | null
  // True until useAuthBootstrap's initial fetchCurrentUser() call settles.
  // ProtectedRoute reads this so a hard-refreshed, actually-logged-in staff
  // member isn't bounced to /login for the one frame before the session
  // rehydrates from the stored token.
  isBootstrapping: boolean
  setUser: (user: User) => void
  finishBootstrap: () => void
  logout: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isBootstrapping: true,
  setUser: (user) => set({ user }),
  finishBootstrap: () => set({ isBootstrapping: false }),
  logout: async () => {
    try {
      await apiLogout()
    } catch {
      // A failed server call (expired token, offline) must not keep this computer signed in; the local session is cleared below.
    } finally {
      // Shared computers: nothing the last person loaded may show to the next.
      queryClient.clear()
      clearPersistedQueries()
      set({ user: null })
    }
  },
}))
