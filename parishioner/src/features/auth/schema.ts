import { z } from 'zod'
import { parishToday } from '../../lib/domain'

export const loginSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

/**
 * People type a mobile number the way they say it: with spaces or dashes, with +63 or 63, or without the leading
 * zero. All of those mean the same number, so they are turned into 09XXXXXXXXX before it is checked and sent.
 */
export function normalizePhone(value: string): string {
  const digits = value.replace(/[\s\-().]/g, '')
  if (/^\+?63\d{10}$/.test(digits)) return `0${digits.replace(/^\+?63/, '')}`
  if (/^9\d{9}$/.test(digits)) return `0${digits}`
  return digits
}

/** Teens sign up for themselves (Confirmation candidates are about 12 to 16); a baby or a child cannot. Mirrors RegisterRequest. */
export const REGISTER_MIN_AGE = 13

function yearsBefore(ymd: string, years: number): string {
  const [y, m, d] = ymd.split('-')
  return `${Number(y) - years}-${m}-${d}`
}

export const registerSchema = z.object({
  fullName: z.string().min(2, 'Enter your full name'),
  birthDate: z
    .string({ error: 'Enter your date of birth' })
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter your date of birth')
    .refine((v) => v <= parishToday(), "Your date of birth can't be in the future")
    .refine((v) => v > parishToday() || v <= yearsBefore(parishToday(), REGISTER_MIN_AGE), `You must be at least ${REGISTER_MIN_AGE} years old to create an account`),
  sex: z.enum(['male', 'female'], { error: 'Select your sex' }),
  email: z.string().email('Enter a valid email address'),
  phone: z.string().transform(normalizePhone).pipe(z.string().regex(/^09\d{9}$/, 'Enter a valid PH mobile number (09XXXXXXXXX)')),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  // Mirrors the backend's RegisterRequest 'privacyConsent' => ['required','accepted']
  // rule — registration can't succeed without it either way, but failing
  // client-side first means the parishioner sees why immediately instead of
  // via a round-trip 422. This is what makes NFR:001's Data Privacy Act
  // claim actually demonstrable rather than just asserted in the paper.
  privacyConsent: z.boolean().refine((v) => v === true, {
    message: 'You must agree to the Privacy Notice to create an account.',
  }),
})

export const forgotPasswordSchema = z.object({
  email: z.string().email('Enter a valid email address'),
})

export const resetPasswordSchema = z
  .object({
    password: z.string().min(8, 'Password must be at least 8 characters'),
    passwordConfirmation: z.string().min(1, 'Confirm your new password'),
  })
  .refine((data) => data.password === data.passwordConfirmation, {
    message: 'Passwords do not match',
    path: ['passwordConfirmation'],
  })

export type LoginInput = z.infer<typeof loginSchema>
export type RegisterInput = z.infer<typeof registerSchema>
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>
