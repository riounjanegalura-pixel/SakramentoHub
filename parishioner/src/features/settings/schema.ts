import { z } from 'zod'
import { normalizePhone } from '../auth/schema'
import { parishToday } from '../../lib/domain'

export const profileSchema = z.object({
  fullName: z.string().min(2, 'Enter your full name'),
  email: z.string().email('Enter a valid email address'),
  phone: z.string().transform(normalizePhone).pipe(z.string().regex(/^09\d{9}$/, 'Enter a valid PH mobile number (09XXXXXXXXX)')),
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter your date of birth')
    .refine((v) => v <= parishToday(), "Your date of birth can't be in the future"),
  sex: z.enum(['male', 'female'], { error: 'Select your sex' }),
  // An untouched select submits '' - treat that as "not set", not as an invalid choice.
  civilStatus: z
    .enum(['single', 'married', 'widowed', 'annulled', 'separated'], { error: 'Select your civil status' })
    .optional()
    .or(z.literal('').transform(() => undefined)),
  addressPsgc: z.string().optional(),
  addressPsgcRegionCode: z.string().optional(),
  addressPsgcProvinceCode: z.string().optional(),
  addressPsgcCityCode: z.string().optional(),
  addressPsgcBarangayCode: z.string().optional(),
  addressLine: z.string().max(255).optional(),
}).refine(
  (v) => !!v.addressPsgc || !v.addressPsgcRegionCode && !v.addressPsgcProvinceCode && !v.addressPsgcCityCode && !v.addressPsgcBarangayCode,
  { message: 'Choose at least a city or municipality', path: ['addressPsgc'] },
)

export type ProfileInput = z.infer<typeof profileSchema>

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(1, 'Confirm your new password'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>

export const deleteAccountSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password'),
  confirmDeletion: z
    .boolean()
    .refine((v) => v === true, { message: 'You must confirm you understand this cannot be undone' }),
})

export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>
