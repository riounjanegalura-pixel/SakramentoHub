import { apiFetch } from './client'
import type { Service } from '../types'

export async function fetchServices(): Promise<Service[]> {
  return apiFetch<Service[]>('/services')
}

export async function fetchService(id: string): Promise<Service> {
  return apiFetch<Service>(`/services/${id}`)
}
