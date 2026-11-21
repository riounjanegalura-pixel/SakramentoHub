import { create } from 'zustand'

export interface ServerFieldError {
  /** Path inside the step's answers ("sponsors.0.age"), or the raw key for appointment/contact errors. */
  path: string
  message: string
}

interface ServerErrorsState {
  byStep: Record<string, ServerFieldError[]>
  setAll: (byStep: Record<string, ServerFieldError[]>) => void
  clearStep: (stepId: string) => void
  clear: () => void
}

/** What the server refused at submit, grouped by the wizard step that owns each field. Not persisted. */
export const useServerErrorsStore = create<ServerErrorsState>((set) => ({
  byStep: {},
  setAll: (byStep) => set({ byStep }),
  clearStep: (stepId) =>
    set((s) => {
      if (!(stepId in s.byStep)) return s
      const { [stepId]: _removed, ...rest } = s.byStep
      return { byStep: rest }
    }),
  clear: () => set({ byStep: {} }),
}))
