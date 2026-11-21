import { useEffect, useState } from 'react'

/**
 * Delays reflecting a fast-changing value (e.g. every keystroke in a search
 * box) until it's stopped changing for `delayMs` — so a query re-fetch only
 * fires once the user pauses typing, not on every keystroke. No debounce
 * utility existed anywhere in this app or parishioner/src before this (item
 * 16's search input is the first thing that needs one).
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs) // debounce
    return () => clearTimeout(timer)
  }, [value, delayMs])

  return debounced
}
