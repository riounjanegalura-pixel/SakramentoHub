import { describe, it, expect, beforeEach, vi } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { PaymentReceivedScreen } from './PaymentReceivedScreen'
import { useAuthStore } from '../../../stores/auth-store'

vi.mock('../../../lib/data/parish', () => ({
  fetchParishInfo: vi.fn(async () => ({ name: 'St. Peter the Apostle Parish', phone: '09123456789', priestName: 'Fr. X', workingHours: { start: '08:00', end: '17:00' } })),
}))

function renderAt(path: string) {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}><PaymentReceivedScreen /></MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('PaymentReceivedScreen (public)', () => {
  beforeEach(() => useAuthStore.setState({ user: null, isBootstrapping: false }))

  it('thanks the payer without needing a login, and does not claim the payment is confirmed', async () => {
    renderAt('/payment/received')
    expect(screen.getByRole('heading', { name: /thank you/i })).toBeInTheDocument()
    expect(screen.getByText(/if you completed the payment in gcash/i)).toBeInTheDocument()
    expect(await screen.findByText(/09123456789/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /log in|sign in/i })).not.toBeInTheDocument()
  })

  it('says the payment was not completed when the payer backed out', () => {
    renderAt('/payment/received?cancelled=1')
    expect(screen.getByRole('heading', { name: /payment not completed/i })).toBeInTheDocument()
    expect(screen.getByText(/ask the parish office for a new payment link/i)).toBeInTheDocument()
  })
})
