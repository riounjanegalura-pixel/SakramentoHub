import { simulateLatency, simulateFailure, getFailureRate } from './latency'
import type { ParishEvent } from '../types'

function nextSunday(d = new Date()) {
  const day = d.getDay()
  const diff = day === 0 ? 0 : 7 - day
  const sunday = new Date(d)
  sunday.setDate(d.getDate() + diff)
  sunday.setHours(8, 0, 0, 0)
  return sunday.toISOString()
}

function baptismDate(d = new Date()) {
  const date = new Date(d)
  date.setDate(d.getDate() + 6)
  date.setHours(9, 0, 0, 0)
  return date.toISOString()
}

const buildEvents = (): ParishEvent[] => [
  {
    id: 'ev-1',
    title: 'Sunday Mass',
    date: nextSunday(),
    location: 'Main Chapel',
    imageUrl: '/mock-assets/sunday-mass.jpg',
    category: 'mass',
  },
  {
    id: 'ev-2',
    title: 'Baptism Ceremony',
    date: baptismDate(),
    location: 'Baptistery',
    imageUrl: '/mock-assets/baptism.jpg',
    category: 'baptism',
  },
]

export async function fetchUpcomingEvents(): Promise<ParishEvent[]> {
  await simulateLatency()
  if (simulateFailure(getFailureRate())) throw new Error('Failed to fetch upcoming events')
  return buildEvents()
}
