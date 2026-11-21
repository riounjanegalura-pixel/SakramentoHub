import '@testing-library/jest-dom'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NotificationPreferencesScreen } from './NotificationPreferencesScreen'
import * as notificationsData from '../../lib/data/notifications'
import { expectNoA11yViolations } from '../../test/a11y'
import { expectTokenOnlySource } from '../../test/tokenSource'

const mockNavigate = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

function renderWithProviders() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <NotificationPreferencesScreen />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('NotificationPreferencesScreen', () => {
  beforeEach(() => {
    localStorage.clear()
    mockNavigate.mockClear()
  })

  it('toggles Push Notifications off on click', async () => {
    renderWithProviders()
    const toggle = await screen.findByRole('switch', { name: 'Push Notifications' })
    expect(toggle).toBeChecked()
    fireEvent.click(toggle)
    await waitFor(() => expect(toggle).not.toBeChecked())
  })

  it('navigates back when the header back button is pressed', async () => {
    renderWithProviders()
    await screen.findByRole('switch', { name: 'Push Notifications' })
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }))
    expect(mockNavigate).toHaveBeenCalledWith(-1)
  })

  it('keeps the bottom tab bar visible so the user can jump to another section', async () => {
    renderWithProviders()
    await screen.findByRole('switch', { name: 'Push Notifications' })
    expect(screen.getByRole('navigation')).toBeInTheDocument()
  })

  it('explains what Booking Reminders covers', async () => {
    renderWithProviders()
    expect(
      await screen.findByText(
        'Emails before your appointment and before a payment window closes. Updates about your own requests are always sent.',
      ),
    ).toBeInTheDocument()
  })

  describe('states and structure', () => {
    it('names what was saved in a status message', async () => {
      renderWithProviders()
      fireEvent.click(await screen.findByRole('switch', { name: 'Push Notifications' }))
      await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Notification preferences saved.'))
    })

    it('shows a skeleton in the final shape while loading', async () => {
      vi.spyOn(notificationsData, 'fetchNotificationPreferences').mockReturnValue(new Promise(() => {}))
      const { container } = renderWithProviders()
      expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(3)
      expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    })

    it('says what happened and offers Retry when loading fails', async () => {
      const fetcher = vi.spyOn(notificationsData, 'fetchNotificationPreferences').mockRejectedValue(new Error('x'))
      renderWithProviders()
      expect(await screen.findByRole('alert')).toHaveTextContent(/couldn.t load your notification preferences/i)
      fetcher.mockResolvedValue({ pushEnabled: true, bookingReminders: true, parishAnnouncements: true })
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
      expect(await screen.findByRole('switch', { name: 'Push Notifications' })).toBeInTheDocument()
    })

    it('says what happened and what to do when saving fails', async () => {
      vi.spyOn(notificationsData, 'updateNotificationPreferences').mockRejectedValue(new Error('Offline'))
      renderWithProviders()
      fireEvent.click(await screen.findByRole('switch', { name: 'Push Notifications' }))
      expect(await screen.findByRole('alert')).toHaveTextContent(/couldn.t save.*try again/i)
    })

    it('uses tokens only, a section heading, list rows and has no violations', async () => {
      const { container } = renderWithProviders()
      await screen.findByRole('switch', { name: 'Push Notifications' })
      expect(screen.getByRole('heading', { level: 2, name: 'Notifications' })).toBeInTheDocument()
      expect(screen.getAllByRole('listitem')).toHaveLength(3)
      expectTokenOnlySource(import.meta.dirname, 'NotificationPreferencesScreen.tsx')
      await expectNoA11yViolations(container)
    })
  })
})
