import { apiFetch } from './client'
import type { AdminParishEvent, Paginated, ParishEventCategory } from '../types'

export interface ParishEventInput {
  title: string
  date: string
  imageUrl?: string
  category: ParishEventCategory
}

export type EventWhen = 'upcoming' | 'past' | ''

export async function fetchParishEvents(page = 1, when: EventWhen = ''): Promise<Paginated<AdminParishEvent>> {
  return apiFetch<Paginated<AdminParishEvent>>(`/admin/parish-events?page=${page}${when ? `&when=${when}` : ''}`)
}

export async function createParishEvent(input: ParishEventInput): Promise<AdminParishEvent> {
  return apiFetch<AdminParishEvent>('/admin/parish-events', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function updateParishEvent(id: string, input: ParishEventInput): Promise<AdminParishEvent> {
  return apiFetch<AdminParishEvent>(`/admin/parish-events/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export async function deleteParishEvent(id: string): Promise<void> {
  return apiFetch<void>(`/admin/parish-events/${id}`, { method: 'DELETE' })
}
