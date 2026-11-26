import { simulateLatency } from './latency'
import type { ParishInfo } from '../types'

/** The demo parish's phone: the mock layer's messages read it from here, never a second copy. */
export const MOCK_PARISH_PHONE = '09123456789'

export async function fetchParishInfo(): Promise<ParishInfo> {
  await simulateLatency()
  return {
    name: 'St. Peter the Apostle Parish',
    phone: MOCK_PARISH_PHONE,
    address: 'Balagtas, Bulacan',
    priestName: 'Rev. Fr. Leopoldo S. Evangelista',
    workingHours: { start: '08:00', end: '17:00' },
    officeDays: [2, 3, 4, 5, 6],
    email: 'parish@stpeterapostle.org',
    lunchBreak: { start: '12:00', end: '13:00' },
  }
}
