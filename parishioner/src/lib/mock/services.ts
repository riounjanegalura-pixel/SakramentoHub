import { simulateLatency, simulateFailure, getFailureRate } from './latency'
import type { Service } from '../types'

export const SERVICES: Service[] = [
  {
    id: 'baptism',
    sacrament: 'baptism',
    name: 'Baptism',
    description: "Schedule your child's baptism ceremony",
    priceCentavos: 5000,
    feeRule: 'per_sponsor',
    durationMinutes: 45,
    offsite: false,
    allowedWeekdays: [2, 3, 4, 5, 6],
    leadTimeDays: 7,
    dailyCapacity: null,
    sessionWeekdays: [7],
    sessionTimes: ['10:00'],
    sessionCapacity: 10,
  },
  {
    id: 'confirmation',
    sacrament: 'confirmation',
    name: 'Confirmation',
    description: 'Schedule the Sacrament of Confirmation',
    priceCentavos: null,
    feeRule: 'none',
    durationMinutes: 60,
    offsite: false,
    allowedWeekdays: [2, 3, 4, 5, 6],
    leadTimeDays: 14,
    dailyCapacity: null,
    sessionWeekdays: null,
    sessionTimes: null,
    sessionCapacity: null,
  },
  {
    id: 'wedding',
    sacrament: 'wedding',
    name: 'Wedding',
    description: 'Book your wedding ceremony',
    priceCentavos: 500000,
    feeRule: 'flat',
    durationMinutes: 90,
    offsite: false,
    allowedWeekdays: [2, 3, 4, 5, 6],
    leadTimeDays: 2,
    dailyCapacity: 2,
    sessionWeekdays: null,
    sessionTimes: null,
    sessionCapacity: null,
  },
  {
    id: 'funeral',
    sacrament: 'funeral',
    name: 'Funeral Mass',
    description: 'Arrange a funeral mass service',
    priceCentavos: null,
    feeRule: 'none',
    durationMinutes: 60,
    offsite: false,
    allowedWeekdays: [1, 2, 3, 4, 5, 6, 7],
    leadTimeDays: 0,
    dailyCapacity: null,
    sessionWeekdays: null,
    sessionTimes: null,
    sessionCapacity: null,
  },
  {
    id: 'anointing',
    sacrament: 'anointing',
    name: 'Anointing of the Sick',
    description: 'Request anointing for the ill',
    priceCentavos: null,
    feeRule: 'none',
    durationMinutes: 30,
    offsite: true,
    allowedWeekdays: [1, 2, 3, 4, 5, 6, 7],
    leadTimeDays: 0,
    dailyCapacity: null,
    sessionWeekdays: null,
    sessionTimes: null,
    sessionCapacity: null,
  },
  {
    id: 'house-blessing',
    sacrament: 'house-blessing',
    name: 'House Blessing & Other',
    description: 'Book house blessing or other services',
    priceCentavos: null,
    feeRule: 'none',
    durationMinutes: 45,
    offsite: true,
    allowedWeekdays: [2, 3, 4, 5, 6],
    leadTimeDays: 3,
    dailyCapacity: null,
    sessionWeekdays: null,
    sessionTimes: null,
    sessionCapacity: null,
  },
]

export async function fetchServices(): Promise<Service[]> {
  await simulateLatency()
  if (simulateFailure(getFailureRate())) throw new Error('Failed to fetch services')
  return SERVICES
}

export async function fetchService(id: string): Promise<Service> {
  await simulateLatency()
  if (simulateFailure(getFailureRate())) throw new Error(`Failed to fetch service ${id}`)
  const found = SERVICES.find((s) => s.id === id)
  if (!found) throw new Error(`Service ${id} not found`)
  return found
}
