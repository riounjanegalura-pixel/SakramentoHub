import { describe, it, expect, beforeEach, vi } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { DeskGuard } from './DeskGuard'
import { useAuthStore } from '../../stores/auth-store'

const flags = vi.hoisted(() => ({ live: true }))
vi.mock('../../lib/data/useApi', () => ({
  get useApi() {
    return flags.live
  },
}))

const account = { id: 'u1', fullName: 'Staff User', email: 's@example.com', phone: '', address: '' }

function renderGuard() {
  render(
    <MemoryRouter initialEntries={['/desk']}>
      <Routes>
        <Route path="/desk" element={<DeskGuard><p>Desk content</p></DeskGuard>} />
        <Route path="/home" element={<p>Home page</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('DeskGuard', () => {
  beforeEach(() => {
    flags.live = true
  })

  it.each(['staff', 'admin'] as const)('lets a %s account in', (role) => {
    useAuthStore.setState({ user: { ...account, role }, isBootstrapping: false })
    renderGuard()
    expect(screen.getByText('Desk content')).toBeInTheDocument()
  })

  it.each([['a parishioner', { role: 'parishioner' as const }], ['an account with no role', {}]])('sends %s home', (_label, over) => {
    useAuthStore.setState({ user: { ...account, ...over }, isBootstrapping: false })
    renderGuard()
    expect(screen.getByText('Home page')).toBeInTheDocument()
    expect(screen.queryByText('Desk content')).not.toBeInTheDocument()
  })

  it('says the desk is not available in demo mode when there is no live server', () => {
    flags.live = false
    useAuthStore.setState({ user: { ...account, role: 'staff' }, isBootstrapping: false })
    renderGuard()
    expect(screen.getByText(/not available in demo mode/i)).toBeInTheDocument()
    expect(screen.queryByText('Desk content')).not.toBeInTheDocument()
  })
})
