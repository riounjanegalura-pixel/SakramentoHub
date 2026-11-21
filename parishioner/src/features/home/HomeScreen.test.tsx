import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { describe, it, expect } from 'vitest'
import '@testing-library/jest-dom'
import { HomeScreen } from './HomeScreen'
import { useAuthStore } from '../../stores/auth-store'

describe('HomeScreen', () => {
  it('greets the logged-in user by first name', async () => {
    useAuthStore.setState({ user: { id: '1', fullName: 'Rio Dela Cruz', email: 'r@x.com', phone: '', address: '' } })
    const client = new QueryClient()
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <HomeScreen />
        </MemoryRouter>
      </QueryClientProvider>
    )
    await waitFor(() => {
      expect(screen.getByText(/Welcome back, Rio/)).toBeInTheDocument()
    })
  })

  it('gives the icon-only notifications link an accessible name', async () => {
    useAuthStore.setState({ user: { id: '1', fullName: 'Rio Dela Cruz', email: 'r@x.com', phone: '', address: '' } })
    const client = new QueryClient()
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <HomeScreen />
        </MemoryRouter>
      </QueryClientProvider>
    )
    expect(screen.getByRole('link', { name: /notifications/i })).toHaveAttribute('href', '/notifications')
  })

  it('renders upcoming events once loaded', async () => {
    useAuthStore.setState({ user: { id: '1', fullName: 'Rio Dela Cruz', email: 'r@x.com', phone: '', address: '' } })
    const client = new QueryClient()
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <HomeScreen />
        </MemoryRouter>
      </QueryClientProvider>
    )
    await waitFor(() => {
      expect(screen.getByText('Sunday Mass')).toBeInTheDocument()
    })
    expect(screen.getByText('Baptism Ceremony')).toBeInTheDocument()
    expect(screen.getByText('See all').closest('a')).toHaveAttribute('href', '/calendar')
  })

  it('has one row into the sacrament list, which lives on Book (no second copy of the list here)', async () => {
    useAuthStore.setState({ user: { id: '1', fullName: 'Rio Dela Cruz', email: 'r@x.com', phone: '', address: '' } })
    const client = new QueryClient()
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <HomeScreen />
        </MemoryRouter>
      </QueryClientProvider>
    )
    const row = screen.getByText('Baptism, wedding, funeral and more').closest('a')
    expect(row).toHaveAttribute('href', '/services')
    expect(screen.queryByRole('link', { name: 'Wedding' })).not.toBeInTheDocument()
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
  })

  it('names the parish from the parish record, not from a hard-coded string', async () => {
    useAuthStore.setState({ user: { id: '1', fullName: 'Rio Dela Cruz', email: 'r@x.com', phone: '', address: '' } })
    const client = new QueryClient()
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <HomeScreen />
        </MemoryRouter>
      </QueryClientProvider>
    )
    expect(await screen.findByText('St. Peter the Apostle Parish')).toBeInTheDocument()
  })
})
