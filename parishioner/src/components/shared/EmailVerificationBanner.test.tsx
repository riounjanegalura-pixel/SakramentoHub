import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { describe, it, expect, beforeEach } from 'vitest'
import '@testing-library/jest-dom'
import { EmailVerificationBanner } from './EmailVerificationBanner'
import { useAuthStore } from '../../stores/auth-store'

function renderWithProviders() {
  const client = new QueryClient()
  return render(
    <QueryClientProvider client={client}>
      <EmailVerificationBanner />
    </QueryClientProvider>
  )
}

describe('EmailVerificationBanner', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, isBootstrapping: false })
  })

  it('renders nothing when there is no logged-in user', () => {
    const { container } = renderWithProviders()
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing for an already-verified user', () => {
    useAuthStore.setState({
      user: { id: '1', fullName: 'Rio', email: 'rio@example.com', phone: '', address: '', emailVerifiedAt: new Date().toISOString() },
    })
    const { container } = renderWithProviders()
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the notice and a working resend button for an unverified user', async () => {
    useAuthStore.setState({
      user: { id: '1', fullName: 'Rio', email: 'rio@example.com', phone: '', address: '', emailVerifiedAt: null },
    })
    renderWithProviders()
    expect(screen.getByText('Please verify your email address')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Resend verification email'))
    await waitFor(() => {
      expect(screen.getByText(/verification email sent/i)).toBeInTheDocument()
    })
  })
})
