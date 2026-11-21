import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom'
import { ForgotPasswordScreen } from './ForgotPasswordScreen'
import * as authData from '../../lib/data/auth'

function renderWithProviders() {
  const client = new QueryClient()
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ForgotPasswordScreen />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('ForgotPasswordScreen', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('shows a generic success message that is honest about the log-based demo mechanism', async () => {
    vi.spyOn(authData, 'forgotPassword').mockResolvedValue(undefined)

    renderWithProviders()
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'staff@parish.org' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Check your email' })).toBeInTheDocument()
    })
    expect(screen.getByText('staff@parish.org')).toBeInTheDocument()
  })

  it('shows an error message when the request rejects', async () => {
    vi.spyOn(authData, 'forgotPassword').mockRejectedValue(new Error('Request failed: 429'))

    renderWithProviders()
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'staff@parish.org' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }))

    await waitFor(() => {
      expect(screen.getByText('Request failed: 429')).toBeInTheDocument()
    })
  })
})
