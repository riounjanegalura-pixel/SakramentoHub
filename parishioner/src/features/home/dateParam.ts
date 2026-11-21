const FIRST_YEAR = 2000
const LAST_YEAR = 2100

/**
 * A `?date=YYYY-MM-DD` search param as a local calendar day. Anything that is not a real day in the
 * supported range (missing, malformed, 2026-02-30, year 1900 or 9999) gives today instead, so a bad
 * link can never break the page.
 */
export function parseDateParam(value: string | null, today: Date = new Date()): Date {
  const m = value ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
    if (y >= FIRST_YEAR && y <= LAST_YEAR) {
      const date = new Date(y, mo - 1, d)
      if (date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d) return date
    }
  }
  return new Date(today.getTime())
}
