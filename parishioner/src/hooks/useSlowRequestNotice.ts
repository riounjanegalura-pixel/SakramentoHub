import { useEffect, useState } from 'react'

/**
 * Flips to true once `isActive` has stayed true for `delayMs` — used to
 * upgrade a plain "Loading…"/"Signing In…" label into a more honest message
 * once a request has been pending long enough that it's very likely Render's
 * free-tier backend waking from sleep (30-60s), not a normal request.
 * Without this, the very first request of a demo — login — just looks hung,
 * with no indication anything is happening.
 */
export function useSlowRequestNotice(isActive: boolean, delayMs = 3000): boolean {
  const [isSlow, setIsSlow] = useState(false)

  useEffect(() => {
    if (!isActive) {
      setIsSlow(false)
      return
    }
    const timer = setTimeout(() => setIsSlow(true), delayMs) // timer: slow-request notice, not animation
    return () => clearTimeout(timer)
  }, [isActive, delayMs])

  return isSlow
}
