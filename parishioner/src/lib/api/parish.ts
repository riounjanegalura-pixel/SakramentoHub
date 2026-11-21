import { apiFetch } from './client'
import type { ParishInfo } from '../types'

export async function fetchParishInfo(): Promise<ParishInfo> {
  return apiFetch<ParishInfo>('/parish')
}
