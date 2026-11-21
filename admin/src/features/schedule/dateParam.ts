const FIRST_YEAR = 2000
const LAST_YEAR = 2100

/**
 * A `?date=YYYY-MM-DD` search param as a calendar day. Anything that is not a real day in the supported
 * range (missing, malformed, 2026-02-30, year 1999 or 2101) gives `today` instead, so a bad link can
 * never break the page. Same rule as the parishioner app's Home calendar.
 */
export function parseDateParam(value: string | null, today: string): string {
  const m = value ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null
  if (!m) return today
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (y < FIRST_YEAR || y > LAST_YEAR) return today
  const check = new Date(Date.UTC(y, mo - 1, d))
  const real = check.getUTCFullYear() === y && check.getUTCMonth() === mo - 1 && check.getUTCDate() === d
  return real ? value! : today
}
