import type { User } from './types'

/** Parish office accounts: the ones that get the office desk. */
export function isStaffSide(user: Pick<User, 'role'> | null | undefined): boolean {
  return user?.role === 'staff' || user?.role === 'admin'
}
