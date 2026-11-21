import { useEffect, useRef, useState } from 'react'

/** setTimeout stores its delay in a 32-bit integer; a longer wait fires immediately. */
const MAX_TIMEOUT_MS = 2_147_483_647

/**
 * Re-renders the component, and calls `onExpire`, at the moment the earliest of the given
 * ISO instants passes — then waits for the next one. Without it a screen decides "is the
 * payment hold over?" only when something else happens to re-render it. A wait longer
 * than the timer limit wakes early (harmlessly) and waits again.
 */
export function useHoldExpiry(expiries: ReadonlyArray<string | null | undefined>, onExpire: () => void): void {
  const [tick, setTick] = useState(0)
  const callback = useRef(onExpire)
  useEffect(() => {
    callback.current = onExpire
  })
  const key = expiries.filter(Boolean).join('|')

  useEffect(() => {
    const now = Date.now()
    const upcoming = key
      .split('|')
      .filter(Boolean)
      .map((iso) => Date.parse(iso))
      .filter((time) => Number.isFinite(time) && time > now)
    if (upcoming.length === 0) return
    // +50 ms so Date.now() is past the instant by the time the timer fires.
    const wait = Math.min(Math.min(...upcoming) - now + 50, MAX_TIMEOUT_MS)
    const id = setTimeout(() => { // timer: hold expiry deadline, not animation
      setTick((n) => n + 1)
      callback.current()
    }, wait)
    return () => clearTimeout(id)
  }, [key, tick])
}
