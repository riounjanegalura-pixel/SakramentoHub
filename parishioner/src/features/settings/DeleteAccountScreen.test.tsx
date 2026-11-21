import '@testing-library/jest-dom'
import { render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { setViewport } from '../../test/viewport'
import { useAuthStore as useAuthStoreForFrame } from '../../stores/auth-store'
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest'
import { DeleteAccountScreen } from './DeleteAccountScreen'
import { useAuthStore } from '../../stores/auth-store'
import * as accountData from '../../lib/data/account'
import * as clientLib from '../../lib/api/client'
import userEvent from '@testing-library/user-event'
import { expectNoA11yViolations } from '../../test/a11y'
import { expectTokenOnlySource } from '../../test/tokenSource'

const mockNavigate = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

function renderWithProviders() {
  const client = new QueryClient()
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <DeleteAccountScreen />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('DeleteAccountScreen', () => {
  beforeEach(() => {
    mockNavigate.mockClear()
    useAuthStore.setState({ user: { id: '1', fullName: 'Rio Galura', email: 'r@x.com', phone: '', address: '' } })
  })

  beforeAll(() => {
    Element.prototype.setPointerCapture ??= () => {}
    Element.prototype.releasePointerCapture ??= () => {}
    Element.prototype.hasPointerCapture ??= () => false
    globalThis.ResizeObserver ??= class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver
  })

  async function openConfirm() {
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Delete my account' }))
    const dialog = await screen.findByRole('dialog', { name: /delete your account/i })
    return { user, dialog }
  }

  it('shows the irreversibility warning up front, as text and not as an alert', () => {
    setViewport(390)
    renderWithProviders()
    expect(screen.getByText(/this cannot be undone/i)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Delete account' })).toBeInTheDocument()
  })

  it('hides the bottom tab bar — the one irreversible, deliberately modal-feeling action', () => {
    setViewport(390)
    renderWithProviders()
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  })

  it('asks for the password only inside the confirm, in a drawer on a phone', async () => {
    setViewport(390)
    renderWithProviders()
    expect(screen.queryByLabelText(/current password/i)).not.toBeInTheDocument()
    const { dialog } = await openConfirm()
    expect(dialog).toHaveAttribute('data-slot', 'drawer-content')
    expect(within(dialog).getByLabelText(/current password/i)).toHaveAttribute('autocomplete', 'current-password')
    expect(within(dialog).getByRole('button', { name: 'Permanently delete my account' })).toHaveAttribute('data-variant', 'destructive')
  })

  it('is a centred dialog on a desktop', async () => {
    setViewport(1280)
    useAuthStore.setState({ user: { id: 'u1', fullName: 'Rita Reyes', email: 'r@example.org', phone: '', address: '' } as never })
    renderWithProviders()
    const { dialog } = await openConfirm()
    expect(dialog).toHaveAttribute('data-slot', 'dialog-content')
  })

  it('returns focus to the delete button when the confirm is cancelled', async () => {
    setViewport(390)
    renderWithProviders()
    const trigger = screen.getByRole('button', { name: 'Delete my account' })
    const { user } = await openConfirm()
    await user.click(screen.getByRole('button', { name: 'Keep my account' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('requires the confirmation checkbox before submitting, and links the error', async () => {
    setViewport(390)
    renderWithProviders()
    const { user, dialog } = await openConfirm()
    await user.type(within(dialog).getByLabelText(/current password/i), 'password123')
    await user.click(within(dialog).getByRole('button', { name: /permanently delete/i }))
    const box = await within(dialog).findByLabelText(/permanent and cannot be undone/i)
    await waitFor(() => expect(box).toHaveAttribute('aria-invalid', 'true'))
    expect(screen.getByText('You must confirm you understand this cannot be undone')).toBeInTheDocument()
    expect(box.getAttribute('aria-describedby')).toMatch(/error/)
  })

  it('shows a real error on the wrong password and keeps what was typed', async () => {
    setViewport(390)
    vi.spyOn(accountData, 'deleteAccount').mockRejectedValue(new Error('Current password is incorrect'))
    renderWithProviders()
    const { user, dialog } = await openConfirm()
    await user.type(within(dialog).getByLabelText(/current password/i), 'wrongpass')
    await user.click(within(dialog).getByLabelText(/permanent and cannot be undone/i))
    await user.click(within(dialog).getByRole('button', { name: /permanently delete/i }))
    await waitFor(() => {
      expect(screen.getByText('Current password is incorrect')).toBeInTheDocument()
    })
    expect(within(dialog).getByLabelText(/current password/i)).toHaveValue('wrongpass')
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('calls the real endpoint, logs out, and redirects to /login on success', async () => {
    setViewport(390)
    vi.spyOn(accountData, 'deleteAccount').mockResolvedValue(undefined)
    const clearAuthTokenSpy = vi.spyOn(clientLib, 'clearAuthToken')

    renderWithProviders()
    const { user, dialog } = await openConfirm()
    await user.type(within(dialog).getByLabelText(/current password/i), 'correctpass1')
    await user.click(within(dialog).getByLabelText(/permanent and cannot be undone/i))
    await user.click(within(dialog).getByRole('button', { name: /permanently delete/i }))

    await waitFor(() => {
      expect(accountData.deleteAccount).toHaveBeenCalledWith('correctpass1')
    })
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true, state: { accountDeleted: true } })
    })
    expect(clearAuthTokenSpy).toHaveBeenCalled()
    expect(useAuthStore.getState().user).toBeNull()
  })

  it('uses design tokens only and has no accessibility violations, page and open confirm', async () => {
    setViewport(390)
    const { container } = renderWithProviders()
    expectTokenOnlySource(import.meta.dirname, 'DeleteAccountScreen.tsx')
    await expectNoA11yViolations(container)
    await openConfirm()
    await expectNoA11yViolations(document.body)
  })

  describe('website frame', () => {
    const original = window.matchMedia
    afterEach(() => {
      window.matchMedia = original
    })

    it('sits inside the website frame on a desktop', async () => {
      setViewport(1280)
      useAuthStoreForFrame.setState({ user: { id: 'u1', fullName: 'Rita Reyes', email: 'r@example.org', phone: '', address: '' } as never })
      renderWithProviders()
      expect(await screen.findByRole('navigation', { name: 'Main' })).toBeInTheDocument()
    })

    it('keeps the phone frame without a tab bar on a phone', () => {
      setViewport(390)
      renderWithProviders()
      expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument()
    })
  })
})
