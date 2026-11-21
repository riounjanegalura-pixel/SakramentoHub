import { apiFetch } from './client'
import type { AdminAnalytics } from '../types'

export async function fetchAnalytics(): Promise<AdminAnalytics> {
  return apiFetch<AdminAnalytics>('/admin/analytics')
}
