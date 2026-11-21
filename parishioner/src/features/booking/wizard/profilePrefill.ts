import type { User } from '../../../lib/types'
import type { FormValues } from '../../../lib/validation/groups'
import { PSGC_LEVELS, psgcCodeKey } from '../../../lib/validation/psgc'

/** The profile's home address as the draft keys of one address group (place, its PSGC codes, street line). */
export function addressFromProfile(user: User, key: string): FormValues {
  const p = user.addressPsgc
  const out: FormValues = {}
  if (p?.display) {
    out[key] = p.display
    const codes: Record<string, string> = { Region: p.regionCode, Province: p.provinceCode, City: p.cityCode, Barangay: p.barangayCode }
    for (const level of PSGC_LEVELS) out[psgcCodeKey(key, level)] = codes[level] ?? ''
  }
  const line = user.addressLine || user.address
  if (line) out[`${key}Line`] = line
  return out
}

/** The profile's civil status, only when this form offers that choice. */
export function civilStatusFromProfile(user: User, allowed: readonly string[]): string | undefined {
  return user.civilStatus && allowed.includes(user.civilStatus) ? user.civilStatus : undefined
}

/** The account holder as one parent of a baptism: name, plus the family residence. */
export function parentFromProfile(user: User, who: 'father' | 'mother', splitName: (full: string) => { first: string; last: string }): FormValues {
  const { first, last } = splitName(user.fullName)
  return { [`${who}FirstName`]: first, [`${who}LastName`]: last, ...addressFromProfile(user, 'parentsResidence') }
}
