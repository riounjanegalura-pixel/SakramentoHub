import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom'
import { StaffUsersScreen } from './StaffUsersScreen'
import * as usersData from '../../lib/data/users'
import { useAuthStore } from '../../stores/auth-store'
import type { Paginated, User } from '../../lib/types'
import { expectNoA11yViolations } from '../../test/a11y'

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: '1',
    fullName: 'Staff One',
    email: 'staff@example.com',
    phone: '',
    address: '',
    role: 'staff',
    isActive: true,
    ...overrides,
  }
}

function makePage(data: User[]): Paginated<User> {
  return {
    data,
    links: { first: null, last: null, prev: null, next: null },
    meta: { current_page: 1, last_page: 1, per_page: 15, total: data.length },
  }
}

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <StaffUsersScreen />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

/** Serves the two lists the screen asks for: admins and parishioners. */
function serve(admins: User[], parishioners: User[] = []) {
  return vi.spyOn(usersData, 'fetchUsers').mockImplementation(async (q) => makePage(q?.role === 'admin' ? admins : parishioners))
}

describe('StaffUsersScreen', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useAuthStore.setState({
      user: { id: 'admin1', fullName: 'Admin', email: 'admin@x.com', phone: '', address: '', role: 'admin', isActive: true },
      isBootstrapping: false,
    })
  })

  it('lists admins and parishioners in their own sections', async () => {
    serve([makeUser({ id: 'a1', fullName: 'Ana Admin', role: 'admin' })], [makeUser({ id: 'p1', fullName: 'Pia Parishioner', role: 'parishioner' })])
    renderScreen()
    await screen.findByText('Ana Admin')
    await screen.findByText('Pia Parishioner')
    expect(within(screen.getByRole('region', { name: 'Admins' })).getByText('Ana Admin')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Parishioners' })).getByText('Pia Parishioner')).toBeInTheDocument()
  })

  it('submits the create-staff form and refetches on success', async () => {
    serve([])
    const createSpy = vi.spyOn(usersData, 'createStaffUser').mockResolvedValue(makeUser())
    renderScreen()
    fireEvent.click(screen.getByRole('button', { name: 'New user' }))
    fireEvent.change(screen.getByLabelText(/^Full name/), { target: { value: 'New Staffer' } })
    fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: 'newstaffer@example.com' } })
    fireEvent.change(screen.getByLabelText(/^Initial password/), { target: { value: 'password123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))
    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({ fullName: 'New Staffer', email: 'newstaffer@example.com', role: 'admin' }), expect.anything())
    })
  })

  it('shows the real backend error when creating a staff account fails', async () => {
    serve([])
    vi.spyOn(usersData, 'createStaffUser').mockRejectedValue(new Error('The email has already been taken.'))
    renderScreen()
    fireEvent.click(screen.getByRole('button', { name: 'New user' }))
    fireEvent.change(screen.getByLabelText(/^Full name/), { target: { value: 'Dup' } })
    fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: 'dup@example.com' } })
    fireEvent.change(screen.getByLabelText(/^Initial password/), { target: { value: 'password123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))
    await waitFor(() => expect(screen.getByText('The email has already been taken.')).toBeInTheDocument())
  })

  it('disables the deactivate button for the only remaining active admin', async () => {
    serve([makeUser({ id: 'admin1', fullName: 'Sole Admin', role: 'admin' })])
    renderScreen()
    await screen.findByText('Sole Admin')
    expect(screen.getByRole('button', { name: /^Deactivate/ })).toBeDisabled()
    expect(screen.getByText('Only remaining admin')).toBeInTheDocument()
  })

  it('does not disable deactivate when a second active admin exists', async () => {
    serve([makeUser({ id: 'a1', fullName: 'Admin One', role: 'admin' }), makeUser({ id: 'a2', fullName: 'Admin Two', role: 'admin' })])
    renderScreen()
    await screen.findByText('Admin One')
    expect(screen.getAllByRole('button', { name: /^Deactivate/ })[0]).not.toBeDisabled()
  })

  it('deactivating a user calls the API', async () => {
    serve([], [makeUser({ fullName: 'Staff One', role: 'parishioner' })])
    const deactivateSpy = vi.spyOn(usersData, 'deactivateUser').mockResolvedValue(makeUser({ isActive: false }))
    renderScreen()
    await screen.findByText('Staff One')
    fireEvent.click(screen.getByRole('button', { name: /^Deactivate/ }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Deactivate account' }))
    await waitFor(() => expect(deactivateSpy).toHaveBeenCalledWith('1', expect.anything()))
  })

  it('shows a Reactivate button for a deactivated user', async () => {
    serve([], [makeUser({ isActive: false, role: 'parishioner' })])
    renderScreen()
    expect(await screen.findByRole('button', { name: /^Reactivate/ })).toBeInTheDocument()
    expect(screen.getByText('Deactivated')).toBeInTheDocument()
  })

  it('has no axe violations', async () => {
    serve([makeUser({ id: 'a', fullName: 'Zed Admin', role: 'admin' })], [makeUser({ id: 'b', fullName: 'Ana Parish', role: 'parishioner' })])
    const { container } = renderScreen()
    await screen.findByText('Zed Admin')
    await screen.findByText('Ana Parish')
    await expectNoA11yViolations(container)
  })

  it('searches both lists by name or email', async () => {
    const spy = serve([])
    renderScreen()
    await waitFor(() => expect(spy).toHaveBeenCalled())
    vi.useFakeTimers()
    fireEvent.change(screen.getByLabelText('Search users'), { target: { value: 'Juana' } })
    await vi.advanceTimersByTimeAsync(300)
    vi.useRealTimers()
    await waitFor(() => expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'Juana', page: 1 })))
    expect(await screen.findAllByText('No users match')).toHaveLength(2)
  })

  it('shows the server refusal inside the deactivate dialog and keeps it open', async () => {
    serve([makeUser({ id: 'a1', fullName: 'Admin One', role: 'admin' }), makeUser({ id: 'a2', fullName: 'Admin Two', role: 'admin' })])
    vi.spyOn(usersData, 'deactivateUser').mockRejectedValue(new Error('Cannot deactivate this account: this is the only remaining admin account.'))
    renderScreen()
    await screen.findByText('Admin One')
    fireEvent.click(screen.getAllByRole('button', { name: /^Deactivate/ })[0])
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Deactivate Admin One?')).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Deactivate account' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('only remaining admin')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('cancelling the deactivate dialog calls nothing', async () => {
    serve([], [makeUser({ role: 'parishioner' })])
    const spy = vi.spyOn(usersData, 'deactivateUser')
    renderScreen()
    await screen.findByText('Staff One')
    fireEvent.click(screen.getByRole('button', { name: /^Deactivate/ }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Keep active' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(spy).not.toHaveBeenCalled()
  })

  it('asks for the missing fields in words before creating an account', async () => {
    serve([])
    const createSpy = vi.spyOn(usersData, 'createStaffUser')
    renderScreen()
    fireEvent.click(screen.getByRole('button', { name: 'New user' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Create account' }))
    expect(await screen.findByText('Enter the full name.')).toBeInTheDocument()
    expect(screen.getByText('Use at least 8 characters.')).toBeInTheDocument()
    expect(createSpy).not.toHaveBeenCalled()
  })

  it('shows an empty state, and an error state', async () => {
    serve([])
    const { unmount } = renderScreen()
    await waitFor(() => expect(screen.getAllByText('No users yet.')).toHaveLength(2))
    unmount()
    vi.spyOn(usersData, 'fetchUsers').mockRejectedValue(new Error('boom'))
    renderScreen()
    expect((await screen.findAllByText(/boom/)).length).toBeGreaterThan(0)
  })

  it('shows 10 parishioners a page and hides the pager when one page is enough', async () => {
    const many = Array.from({ length: 15 }, (_, i) => makeUser({ id: `p${i}`, fullName: `Parishioner ${i}`, role: 'parishioner' }))
    vi.spyOn(usersData, 'fetchUsers').mockImplementation(async (q) =>
      q?.role === 'admin' ? makePage([]) : { ...makePage(many), meta: { current_page: 1, last_page: 2, per_page: 15, total: 25 } },
    )
    renderScreen()
    await screen.findByText('Parishioner 0')
    expect(within(screen.getByRole('list', { name: 'Parishioners list' })).getAllByRole('listitem')).toHaveLength(10)
    expect(screen.getByText('Showing 1 to 10 of 25')).toBeInTheDocument()
    expect(screen.getAllByRole('navigation', { name: 'Pages' })).toHaveLength(1)
  })
})
