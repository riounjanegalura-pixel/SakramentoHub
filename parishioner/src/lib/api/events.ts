import { apiFetch } from './client'
import type { ParishEvent } from '../types'

export async function fetchUpcomingEvents(): Promise<ParishEvent[]> {
  return apiFetch<ParishEvent[]>('/events/upcoming')
}
