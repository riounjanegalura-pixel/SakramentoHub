import { z } from 'zod'
import type { FieldValues } from 'react-hook-form'
import { psgcCodeFields } from './psgc'
import { CATHOLIC_ONLY, RELIGIONS, SUFFIXES, parishToday } from '../domain'

/** Mirrors backend App\Validation\FieldGroups. Keys: plan Field Dictionary.
 * Same type React Hook Form uses, so field components and wizard forms agree. */
export type FormValues = FieldValues

export const NAME_PATTERN = /^[\p{L}\p{M} .'-]+$/u
const NAME_MESSAGE = 'Use letters, spaces, periods, apostrophes or hyphens only'

export const nameField = (label: string) =>
  z.string({ error: `Enter the ${label}` }).trim().min(1, `Enter the ${label}`).max(80).regex(NAME_PATTERN, NAME_MESSAGE)

export const optionalName = z
  .string()
  .trim()
  .max(80)
  .refine((v) => v === '' || NAME_PATTERN.test(v), NAME_MESSAGE)
  .nullish()

const YMD = /^\d{4}-\d{2}-\d{2}$/

/** `ymd` minus whole years, by string arithmetic; Feb 29 clamps to Feb 28 (as Carbon's subYears does). */
export function yearsBefore(ymd: string, years: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const ty = y - years
  const leap = (ty % 4 === 0 && ty % 100 !== 0) || ty % 400 === 0
  const day = m === 2 && d === 29 && !leap ? 28 : d
  return `${String(ty).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export const pastDate = (label: string, minAgeYears?: number) =>
  z
    .string({ error: `Enter the ${label}` })
    .regex(YMD, `Enter the ${label}`)
    .refine((v) => v <= parishToday(), `The ${label} can't be in the future`)
    .refine((v) => minAgeYears === undefined || v <= yearsBefore(parishToday(), minAgeYears), `Must be at least ${minAgeYears} years old`)

export const requiredDoc = (label: string) => z.string({ error: `Upload the ${label}` }).min(1, `Upload the ${label}`)
export const optionalDoc = z.string().nullish()

export interface PersonOptions {
  dob?: boolean
  minAgeYears?: number
  placeOfBirth?: boolean
  sex?: boolean
  religion?: boolean
  citizenship?: boolean
  civilStatus?: readonly string[]
  age?: boolean
  /** Catholics only: the religion is fixed to Roman Catholic. */
  catholicOnly?: boolean
  /** Sex fixed by the role (groom, father...). Decides whether the person has a suffix: men only. */
  fixedSex?: 'male' | 'female'
}

export function addressShape(key: string, required = true, withLine = true): z.ZodRawShape {
  return {
    [key]: required
      ? z.string({ error: 'Select the city/municipality and barangay' }).min(1, 'Select the city/municipality and barangay')
      : z.string().nullish(),
    ...psgcCodeFields(key),
    ...(withLine ? { [`${key}Line`]: z.string().max(255).nullish() } : {}),
  }
}

/** Every draft key an address group can hold: the readable place, its four PSGC codes and (optionally) the street line. */
export function addressKeys(key: string, withLine = true): string[] {
  return Object.keys(addressShape(key, false, withLine))
}

/** Every draft key a person group can hold, for the same options passed to personShape. */
export function personKeys(p: string, o: PersonOptions = {}): string[] {
  return Object.keys(personShape(p, o))
}

export function personShape(p: string, o: PersonOptions = {}): z.ZodRawShape {
  return {
    [`${p}FirstName`]: nameField('first name'),
    [`${p}MiddleName`]: optionalName,
    [`${p}LastName`]: nameField('last name'),
    [`${p}Suffix`]: z.enum(['', ...SUFFIXES]).nullish(),
    ...(o.dob ? { [`${p}DateOfBirth`]: pastDate('date of birth', o.minAgeYears) } : {}),
    ...(o.placeOfBirth ? addressShape(`${p}PlaceOfBirth`, true, false) : {}),
    ...(o.sex ? { [`${p}Sex`]: z.enum(['male', 'female'], { error: 'Select the sex' }) } : {}),
    ...(o.religion ? { [`${p}Religion`]: z.enum(o.catholicOnly ? CATHOLIC_ONLY : RELIGIONS, { error: 'Select the religion' }) } : {}),
    ...(o.citizenship ? { [`${p}Citizenship`]: z.string({ error: 'Enter the citizenship' }).trim().min(1, 'Enter the citizenship').max(60) } : {}),
    ...(o.civilStatus ? { [`${p}CivilStatus`]: z.enum(o.civilStatus as [string, ...string[]], { error: 'Select the civil status' }) } : {}),
    ...(o.age ? { [`${p}Age`]: z.number({ error: 'Enter the age' }).int().min(0).max(130) } : {}),
  }
}

export function sponsorShape(min: number, max: number, minAge: number): z.ZodRawShape {
  const sponsor = z.looseObject({
    role: z.enum(['ninong', 'ninang'], { error: 'Choose Ninong or Ninang' }),
    firstName: nameField('first name'),
    middleName: optionalName,
    lastName: nameField('last name'),
    age: z.number({ error: 'Enter the age' }).int().min(minAge, `Must be at least ${minAge} years old`).max(120),
    religion: z.enum(RELIGIONS, { error: 'Select the religion' }),
    residence: z.string({ error: 'Select at least the city/municipality' }).min(1, 'Select at least the city/municipality'),
    residenceLine: z.string().max(255).nullish(),
  })

  return {
    sponsors: z
      .array(sponsor, { error: 'Add the sponsors' })
      .min(min, min === 1 ? 'Add at least one sponsor' : `Add at least ${min} sponsors`)
      .max(max, `Add at most ${max} sponsors`),
  }
}

/** Every key of a strict shape, relaxed to "anything, optional" — for groups required only conditionally. */
export function loose(shape: z.ZodRawShape): z.ZodRawShape {
  return Object.fromEntries(Object.keys(shape).map((k) => [k, z.any().optional()]))
}

/** Runs a strict schema against the data and copies its issues into an outer refinement. */
export function refineWith(ctx: z.RefinementCtx, schema: z.ZodType, data: unknown): void {
  const result = schema.safeParse(data)
  if (!result.success) {
    for (const issue of result.error.issues) {
      ctx.addIssue({ code: 'custom', message: issue.message, path: issue.path })
    }
  }
}
