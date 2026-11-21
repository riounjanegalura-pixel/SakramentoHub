import { formatDate, parishToday } from '../../../lib/domain'
import type { FormValues } from '../../../lib/validation/groups'

/** Review rows. A full YYYY-MM-DD value reads as a date; anything else is shown as typed. */
export function rows(entries: Array<[string, unknown]>): Array<[string, string]> {
  return entries
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => [k, typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? formatDate(v) : String(v)])
}

export function personName(d: FormValues, prefix: string): string {
  return [d[`${prefix}FirstName`], d[`${prefix}MiddleName`], d[`${prefix}LastName`], d[`${prefix}Suffix`]]
    .filter((p) => typeof p === 'string' && p.trim() !== '')
    .join(' ')
}

export function addressText(d: FormValues, key: string): string {
  return [d[`${key}Line`], d[key]].filter((p) => typeof p === 'string' && p.trim() !== '').join(', ')
}

export function docStatus(d: FormValues, key: string): string {
  return d[key] ? '✓ Uploaded' : 'Not uploaded'
}

export function yesNo(v: unknown): string {
  return v === true ? 'Yes' : 'No'
}

/** Best-effort split of the account's single full-name field; the user can correct it. */
export function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/)
  if (parts.length < 2) return { first: parts[0] ?? '', last: '' }
  return { first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1] }
}

/** Whole years on the parish (Manila) calendar; undefined for a missing, invalid or future date. */
export function ageFrom(ymd: string | null | undefined): number | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd ?? '')
  if (!m) return undefined
  const [by, bm, bd] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const check = new Date(Date.UTC(by, bm - 1, bd))
  if (check.getUTCMonth() !== bm - 1 || check.getUTCDate() !== bd) return undefined
  const [ty, tm, td] = parishToday().split('-').map(Number)
  let age = ty - by
  if (tm < bm || (tm === bm && td < bd)) age--
  return age < 0 ? undefined : age
}
