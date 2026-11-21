import { simulateLatency } from './latency'
import type { ParishInfo } from '../types'

export async function fetchParishInfo(): Promise<ParishInfo> {
  await simulateLatency()
  return {
    name: 'St. Peter the Apostle Parish',
    phone: '09123456789',
    address: 'Balagtas, Bulacan',
    priestName: 'Rev. Fr. Leopoldo S. Evangelista',
    workingHours: { start: '08:00', end: '17:00' },
    lunchBreak: { start: '12:00', end: '13:00' },
  }
}
