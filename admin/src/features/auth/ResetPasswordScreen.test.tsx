import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom'
import { ResetPasswordScreen } from './ResetPasswordScreen'
import * as authData from '../../lib/data/auth'
import { ApiError } from '../../lib/api/client'

function renderAt(path: string) {
  const client = new QueryClient()
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/reset-password" element={<ResetPasswordScreen />} />
          <Route path="/login" element={<div>Login Screen</div>} />
          <Route path="/forgot-password" element={<div>Forgot Password Screen</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('ResetPasswordScreen', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('shows an error and a request-new-link button when token/email are missing', () => {
    renderAt('/reset-password')
    expect(screen.getByText(/missing its details/i)).toBeInTheDocument()
    fireEvent.click(screen.getByText('Request a new link'))
    expect(screen.getByText('Forgot Password Screen')).toBeInTheDocument()
  })

  it('shows a client-side error for a mismatched confirmation without calling the API', async () => {
    const spy = vi.spyOn(authData, 'resetPassword').mockResolvedValue(undefined)
    renderAt('/reset-password?token=abc&email=staff@parish.org')
    fireEvent.change(screen.getByLabelText(/new password/i), { target: { value: 'password123' } })
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'different123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save new password' }))

    await waitFor(() => {
      expect(screen.getByText(/Passwords do not match/)).toBeInTheDocument()
    })
    expect(spy).not.toHaveBeenCalled()
  })

  it('resets the password and redirects to login on success', async () => {
    vi.spyOn(authData, 'resetPassword').mockResolvedValue(undefined)
    renderAt('/reset-password?token=abc&email=staff@parish.org')
    fireEvent.change(screen.getByLabelText(/new password/i), { target: { value: 'password123' } })
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'password123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save new password' }))

    await waitFor(() => {
      expect(screen.getByText('Login Screen')).toBeInTheDocument()
    })
  })

  it('shows the real backend error on an invalid/expired token', async () => {
    vi.spyOn(authData, 'resetPassword').mockRejectedValue(
      new Error('This reset link is invalid or has expired.'),
    )
    renderAt('/reset-password?token=bad&email=staff@parish.org')
    fireEvent.change(screen.getByLabelText(/new password/i), { target: { value: 'password123' } })
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'password123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save new password' }))

    await waitFor(() => {
      expect(screen.getByText('This reset link is invalid or has expired.')).toBeInTheDocument()
    })
  })

  it('swaps to the link-cannot-be-used screen when the server refuses the link as expired', async () => {
    vi.spyOn(authData, 'resetPassword').mockRejectedValue(new ApiError('This reset link is invalid or has expired.', 422, null))
    renderAt('/reset-password?token=old&email=staff@parish.org')
    fireEvent.change(screen.getByLabelText(/new password/i), { target: { value: 'password123' } })
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'password123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save new password' }))
    expect(await screen.findByRole('heading', { name: "This link can't be used" })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Request a new link' })).toHaveAttribute('href', '/forgot-password')
  })

  it('asks for 8 characters in words before calling the API', async () => {
    const spy = vi.spyOn(authData, 'resetPassword')
    renderAt('/reset-password?token=t&email=staff@parish.org')
    fireEvent.change(screen.getByLabelText(/new password/i), { target: { value: 'short' } })
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'short' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save new password' }))
    expect(await screen.findByText('Use at least 8 characters.')).toBeInTheDocument()
    expect(spy).not.toHaveBeenCalled()
  })
})
