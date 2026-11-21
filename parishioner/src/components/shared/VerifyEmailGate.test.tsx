import { beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { VerifyEmailGate } from './VerifyEmailGate'
import { useAuthStore } from '../../stores/auth-store'

const verifyEmailCode = vi.fn()
const fetchCurrentUser = vi.fn()
vi.mock('../../lib/data/auth', () => ({
  resendVerificationEmail: vi.fn(),
  verifyEmailCode: (...a: unknown[]) => verifyEmailCode(...a),
}))
vi.mock('../../lib/data/users', () => ({ fetchCurrentUser: (...a: unknown[]) => fetchCurrentUser(...a) }))

const user = { id: '1', fullName: 'Rio', email: 'rio@example.com', phone: '', address: '', role: 'parishioner' as const, emailVerifiedAt: null }

function renderGate() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <VerifyEmailGate />
    </QueryClientProvider>,
  )
}

describe('VerifyEmailGate code entry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchCurrentUser.mockResolvedValue(null)
    useAuthStore.setState({ user })
  })

  it('takes only digits, needs all six, then confirms and lets the person in', async () => {
    verifyEmailCode.mockResolvedValue(undefined)
    fetchCurrentUser.mockResolvedValue({ ...user, emailVerifiedAt: '2026-11-02T00:00:00Z' })
    renderGate()
    const input = screen.getByLabelText(/6-digit code/i)
    const confirm = screen.getByRole('button', { name: 'Confirm' })

    await userEvent.type(input, '12a34')
    expect(input).toHaveValue('1234')
    expect(confirm).toBeDisabled()

    await userEvent.type(input, '56')
    await userEvent.click(confirm)

    expect(verifyEmailCode).toHaveBeenCalledWith('123456')
    await waitFor(() => expect(useAuthStore.getState().user?.emailVerifiedAt).toBe('2026-11-02T00:00:00Z'))
  })

  it('says why when the code is wrong', async () => {
    verifyEmailCode.mockRejectedValue(new Error('That code is wrong or has expired. Check the latest email, or send a new one.'))
    renderGate()
    await userEvent.type(screen.getByLabelText(/6-digit code/i), '000000')
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('wrong or has expired')
    expect(useAuthStore.getState().user?.emailVerifiedAt).toBeNull()
  })
})
