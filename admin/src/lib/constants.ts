import type { Sacrament } from './types'

/** Display label per sacrament. Shared across the bookings queue, booking
 * detail, and dashboard screens — lives here rather than inside any one
 * screen so those screens don't have to change for a reason unrelated to
 * themselves whenever this lookup changes. */
export const SACRAMENT_LABEL: Record<Sacrament, string> = {
  baptism: 'Baptism',
  wedding: 'Wedding',
  confirmation: 'Confirmation',
  funeral: 'Funeral Mass',
  anointing: 'Anointing of the Sick',
  'house-blessing': 'House Blessing',
}
