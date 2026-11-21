import { beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { WebWallet } from './WebWallet'
import { useAuthStore } from '../stores/auth-store'
import { setViewport } from '../test/viewport'
import { expectNoA11yViolations } from '../test/a11y'
import { expectTokenOnlySource } from '../test/tokenSource'

vi.mock('../lib/data/wallet', () => ({ fetchWallet: vi.fn(async () => []), deleteWalletDocument: vi.fn() }))
vi.mock('../lib/data/documents', () => ({ fetchDocumentFile: vi.fn() }))
vi.mock('../lib/data/registerEntries', () => ({
  fetchMyRegisterEntries: vi.fn(async () => []),
  fetchRegisterEntryCertificateHtml: vi.fn(),
}))

describe('WebWallet', () => {
  beforeEach(() => {
    setViewport(1280)
    localStorage.removeItem('sakramentohub_wallet_consent_seen')
    useAuthStore.setState({ user: { id: 'u1', fullName: 'Ricardo Dalisay', email: 'r@example.com', phone: '', address: '', emailVerifiedAt: '2026-01-01' } as never })
  })

  it('shows the Documents heading, the documents column and the request link', async () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <WebWallet />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(screen.getByRole('heading', { name: 'Documents' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'My documents' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Got it' })).toBeInTheDocument()
    // One request action, carried by the My requests section (not a second copy beside it).
    expect(screen.getAllByRole('link', { name: 'Request a certificate copy' })).toHaveLength(1)
    expect(screen.getByRole('link', { name: 'Request a certificate copy' })).toHaveAttribute('href', '/certificates/request')
    setViewport(390)
  })

  it('has two columns on a desktop, tokens only and no accessibility violations', async () => {
    expectTokenOnlySource(import.meta.dirname, 'WebWallet.tsx')
    const { container } = render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <WebWallet />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(container.querySelector('.lg\\:grid-cols-2')).toBeTruthy()
    await screen.findByText('No documents saved yet.')
    await expectNoA11yViolations(container)
    setViewport(390)
  })
})
