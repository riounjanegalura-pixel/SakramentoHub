import { z } from 'zod'

/**
 * Shared helper for wizard date fields that represent a *future* scheduled
 * event (an appointment date, a ceremony date) — as opposed to a
 * legitimately past date (a birth date, a date of death, a marriage date
 * already on record). Only apply this to the former.
 */

export const NOT_PAST_DATE_MESSAGE = 'Choose a date that is today or later'

/** Today's date at local midnight, for comparing against `YYYY-MM-DD` strings. */
function startOfToday(): Date {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return today
}

/**
 * True when `dateString` (an HTML `<input type="date">` value, `YYYY-MM-DD`)
 * is today or later in local time. An empty string passes — emptiness is a
 * separate `min(1, …)`/required concern, not this helper's job.
 */
export function isTodayOrFutureDate(dateString: string): boolean {
  if (!dateString) return true
  const value = new Date(`${dateString}T00:00:00`)
  if (Number.isNaN(value.getTime())) return true // malformed dates are a format concern, not ours
  return value.getTime() >= startOfToday().getTime()
}

/** Today's date as `YYYY-MM-DD`, for the HTML `min` attribute on date inputs. */
export function todayDateString(): string {
  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/**
 * Chains a not-in-the-past refinement onto a required date string schema.
 * Use for appointment/ceremony date fields only.
 */
export function requireFutureDate<T extends z.ZodType<string>>(
  schema: T,
  message: string = NOT_PAST_DATE_MESSAGE,
) {
  return schema.refine(isTodayOrFutureDate, message)
}
