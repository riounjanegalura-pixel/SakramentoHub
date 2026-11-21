import { createContext } from 'react'

/**
 * What the persistent layout (RootLayout) offers the screen inside it. AppShell is the only user:
 * - `showBar(true)` while a phone screen wants the bottom bar (reset on unmount), so the bar is
 *   drawn once by the layout and stays mounted between routes, and its gold indicator can slide;
 * - `animateEntry` is true after the first navigation, so the first page does not animate on load.
 * Outside the layout (unit tests of a single screen) the context is null and AppShell draws its own bar.
 */
export interface ShellHost {
  showBar: (on: boolean) => void
  animateEntry: boolean
}

export const ShellHostContext = createContext<ShellHost | null>(null)
