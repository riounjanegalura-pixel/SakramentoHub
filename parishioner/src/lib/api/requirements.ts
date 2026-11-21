import { apiFetch } from './client'
import type { ServiceRequirements } from '../types'

/** What a service asks people to prepare (public; the same list booking validation reads). */
export async function fetchRequirements(serviceId: string): Promise<ServiceRequirements> {
  return apiFetch<ServiceRequirements>(`/services/${serviceId}/requirements`)
}
