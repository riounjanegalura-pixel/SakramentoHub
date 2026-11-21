import { apiFetch } from './client'
import type { Paginated, Role, User } from '../types'

export interface UsersQuery {
  role?: Role | ''
  search?: string
  page?: number
}

function toQueryString(query: UsersQuery): string {
  const params = new URLSearchParams()
  if (query.role) params.set('role', query.role)
  if (query.search?.trim()) params.set('search', query.search.trim())
  if (query.page) params.set('page', String(query.page))
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

export async function fetchUsers(query: UsersQuery = {}): Promise<Paginated<User>> {
  return apiFetch<Paginated<User>>(`/admin/users${toQueryString(query)}`)
}

export interface CreateStaffInput {
  fullName: string
  email: string
  phone?: string
  password: string
  role: 'admin'
}

export async function createStaffUser(input: CreateStaffInput): Promise<User> {
  return apiFetch<User>('/admin/users', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function changeUserRole(id: string, role: Role): Promise<User> {
  return apiFetch<User>(`/admin/users/${id}/role`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  })
}

export async function deactivateUser(id: string): Promise<User> {
  return apiFetch<User>(`/admin/users/${id}/deactivate`, { method: 'PATCH' })
}

export async function activateUser(id: string): Promise<User> {
  return apiFetch<User>(`/admin/users/${id}/activate`, { method: 'PATCH' })
}
