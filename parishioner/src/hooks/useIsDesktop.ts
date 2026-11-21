import { useSyncExternalStore } from 'react'

/** Desktop layouts start here (Tailwind's `lg`). Below it every route renders its mobile screen. */
export const DESKTOP_QUERY = '(min-width: 1024px)'

const hasMatchMedia = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function'

function subscribe(onChange: () => void): () => void {
  if (!hasMatchMedia()) return () => {}
  const mql = window.matchMedia(DESKTOP_QUERY)
  mql.addEventListener('change', onChange)
  return () => mql.removeEventListener('change', onChange)
}

const snapshot = (): boolean => hasMatchMedia() && window.matchMedia(DESKTOP_QUERY).matches

export function useIsDesktop(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false)
}
