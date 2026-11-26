import { createContext } from 'react'

/**
 * What a step with tabs hands to its frame so the one Next button can walk the tabs (Father, then Mother, then Family
 * residence) before it moves to another page. `advance` resolves true when it handled the press itself, either by opening
 * the next tab or by staying put because the open tab has problems; false when the open tab is the last (or there are
 * none), so the frame carries on to the whole step's own check and the next page.
 */
export interface TabAdvance {
  advance: () => Promise<boolean>
}

export const TabAdvanceContext = createContext<{ set: (advance: TabAdvance | null) => void } | null>(null)
