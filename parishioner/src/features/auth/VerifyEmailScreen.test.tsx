import { StrictMode } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { describe, it, expect, afterEach, vi } from 'vitest'
import '@testing-library/jest-dom'
import { VerifyEmailScreen } from './VerifyEmailScreen'
import * as authData from '../../lib/data/auth'
import { expectNoA11yViolations } from '../../test/a11y'

function renderAt(path: string, { strict = false } = {}) {
  const client = new QueryClient()
  const tree = (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/verify-email" element={<VerifyEmailScreen />} />
          <Route path="/login" element={<div>Login Screen</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree)
}

describe('VerifyEmailScreen', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('shows an invalid-link message when token/email are missing', () => {
    renderAt('/verify-email')
    expect(screen.getByText('Invalid Link')).toBeInTheDocument()
  })

  it('announces the result as a status and has no accessibility violations in each state', async () => {
    const invalid = renderAt('/verify-email')
    await expectNoA11yViolations(invalid.container)
    invalid.unmount()
    const { container } = renderAt('/verify-email?token=abc&email=rio@example.com')
    expect(screen.getByRole('status')).toBeInTheDocument()
    await expectNoA11yViolations(container)
    await screen.findByText('Email Verified')
    expect(screen.getByRole('status')).toHaveTextContent('Email Verified')
    expect(screen.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute('href', '/login')
    await expectNoA11yViolations(container)
  })

  it('verifies successfully with a token and email present', async () => {
    renderAt('/verify-email?token=abc&email=rio@example.com')
    await waitFor(() => {
      expect(screen.getByText('Email Verified')).toBeInTheDocument()
    })
  })

  it('shows the masked email the link applies to', async () => {
    renderAt('/verify-email?token=abc&email=rio@example.com')
    await waitFor(() => {
      expect(screen.getByText('r***@example.com')).toBeInTheDocument()
    })
  })

  it('shows a failure message when verification rejects', async () => {
    vi.stubEnv('VITE_MOCK_FAILURE_RATE', '1')
    renderAt('/verify-email?token=abc&email=rio@example.com')
    await waitFor(() => {
      expect(screen.getByText('Verification Failed')).toBeInTheDocument()
    })
  })

  it('fires the verify request exactly once, even under StrictMode double-invoke', async () => {
    const spy = vi.spyOn(authData, 'verifyEmail')
    renderAt('/verify-email?token=abc&email=rio@example.com', { strict: true })
    await waitFor(() => {
      expect(screen.getByText('Email Verified')).toBeInTheDocument()
    })
    expect(spy).toHaveBeenCalledTimes(1)
  })
})
