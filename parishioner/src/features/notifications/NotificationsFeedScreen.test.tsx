import '@testing-library/jest-dom'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { setViewport } from '../../test/viewport'
import { useAuthStore as useAuthStoreForFrame } from '../../stores/auth-store'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NotificationsFeedScreen } from './NotificationsFeedScreen'
import * as notificationsData from '../../lib/data/notifications'
import { expectNoA11yViolations } from '../../test/a11y'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const mockNavigate = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

describe('NotificationsFeedScreen', () => {
  beforeEach(() => {
    localStorage.clear()
    mockNavigate.mockClear()
    vi.restoreAllMocks()
  })

  it('groups notifications under Today and Earlier headers', async () => {
    const client = new QueryClient()
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <NotificationsFeedScreen />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    await waitFor(() => {
      expect(screen.getByText('TODAY')).toBeInTheDocument()
      expect(screen.getByText('EARLIER')).toBeInTheDocument()
      expect(screen.getByText('Mass Reminder')).toBeInTheDocument()
    })
  })

  it('navigates back when the header back button is pressed', async () => {
    mockNavigate.mockClear()
    const client = new QueryClient()
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <NotificationsFeedScreen />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    await waitFor(() => {
      expect(screen.getByText('TODAY')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }))
    expect(mockNavigate).toHaveBeenCalledWith(-1)
  })

  it('marks a single notification read when clicked, without marking the others', async () => {
    const client = new QueryClient()
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <NotificationsFeedScreen />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('Mass Reminder')).toBeInTheDocument()
    })
    expect(screen.getByText('3 unread')).toBeInTheDocument()

    const notificationButton = screen.getByText('Mass Reminder').closest('button')
    expect(notificationButton).not.toBeNull()
    fireEvent.click(notificationButton!)

    // markNotificationRead + the refetch it triggers each carry the mock
    // layer's randomized 300-800ms simulateLatency — back to back, that can
    // exceed waitFor's default 1000ms timeout often enough to flake. Give
    // this one assertion real headroom instead.
    await waitFor(
      () => {
        expect(screen.getByText('2 unread')).toBeInTheDocument()
      },
      { timeout: 3000 },
    )
  })

  function renderFeed() {
    const client = new QueryClient()
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <NotificationsFeedScreen />
        </MemoryRouter>
      </QueryClientProvider>,
    )
  }

  it('opens the booking of a linked notification, marking it read first', async () => {
    const markRead = vi.spyOn(notificationsData, 'markNotificationRead').mockResolvedValue(undefined)
    renderFeed()
    fireEvent.click(await screen.findByRole('button', { name: /Baptism Schedule/ }))
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/booking/history/bk-1'))
    expect(markRead.mock.calls[0][0]).toBe('n-2')
  })

  it('still opens the booking when marking read fails', async () => {
    vi.spyOn(notificationsData, 'markNotificationRead').mockRejectedValue(new Error('offline'))
    renderFeed()
    fireEvent.click(await screen.findByRole('button', { name: /Baptism Schedule/ }))
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/booking/history/bk-1'))
  })

  it('does not navigate from a notification without a booking', async () => {
    vi.spyOn(notificationsData, 'markNotificationRead').mockResolvedValue(undefined)
    renderFeed()
    fireEvent.click(await screen.findByRole('button', { name: /Mass Reminder/ }))
    await new Promise((r) => setTimeout(r, 50))
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  describe('states and structure', () => {
    const items = [
      { id: 'a', title: 'Mass Reminder', body: 'Starts in 2 hours', category: 'today', read: false, icon: 'calendar', bookingId: null, createdAt: '2026-10-12T01:30:00.000Z' },
      { id: 'b', title: 'Baptism Schedule', body: 'Confirmed for March 22', category: 'earlier', read: true, icon: 'booking', bookingId: 'bk-1', createdAt: '2026-10-08T03:00:00.000Z' },
    ] as notificationsData.AppNotification[]

    it('uses no raw hex colours and no animation or transition classes', () => {
      const source = readFileSync(join(import.meta.dirname, 'NotificationsFeedScreen.tsx'), 'utf8')
      expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
      expect(source).not.toMatch(/brand-/)
      expect(source).not.toMatch(/\b(animate|transition)-/)
    })

    it('lists notifications as real list items with a tabular time and an unread cue that is not colour only', async () => {
      vi.spyOn(notificationsData, 'fetchNotifications').mockResolvedValue(items)
      renderFeed()
      const rows = await screen.findAllByRole('listitem')
      expect(rows).toHaveLength(2)
      expect(rows[0]).toHaveTextContent('Mass Reminder')
      expect(rows[0]).toHaveTextContent('Starts in 2 hours')
      expect(rows[0]).toHaveTextContent(/new/i)
      expect(rows[1]).not.toHaveTextContent(/new/i)
      const time = rows[0].querySelector('time')
      expect(time).not.toBeNull()
      expect(time).toHaveClass('tabular-nums')
      expect(time).toHaveAttribute('datetime', '2026-10-12T01:30:00.000Z')
    })

    it('shows a skeleton while loading, announced to assistive tech', () => {
      vi.spyOn(notificationsData, 'fetchNotifications').mockReturnValue(new Promise(() => {}))
      renderFeed()
      expect(screen.getByText('Loading notifications')).toBeInTheDocument()
      expect(document.querySelector('[data-slot="skeleton"]')).not.toBeNull()
    })

    it("says You're all caught up and what notifications are for when there are none", async () => {
      vi.spyOn(notificationsData, 'fetchNotifications').mockResolvedValue([])
      renderFeed()
      expect(await screen.findByText("You're all caught up.")).toBeInTheDocument()
      expect(screen.getByText(/reminders and updates/i)).toBeInTheDocument()
      expect(screen.queryByRole('list')).not.toBeInTheDocument()
    })

    it('offers a retry when loading fails', async () => {
      const fetchSpy = vi.spyOn(notificationsData, 'fetchNotifications').mockRejectedValueOnce(new Error('offline'))
      render(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <MemoryRouter><NotificationsFeedScreen /></MemoryRouter>
        </QueryClientProvider>,
      )
      expect(await screen.findByText(/couldn.t load your notifications/i)).toBeInTheDocument()
      fetchSpy.mockResolvedValue(items)
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
      expect(await screen.findByText('Mass Reminder')).toBeInTheDocument()
    })

    it('has no accessibility violations in the loading, empty, error and list states', async () => {
      const spy = vi.spyOn(notificationsData, 'fetchNotifications')
      spy.mockReturnValue(new Promise(() => {}))
      const loading = render(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><NotificationsFeedScreen /></MemoryRouter></QueryClientProvider>,
      )
      await expectNoA11yViolations(loading.container)
      loading.unmount()

      spy.mockResolvedValue([])
      const empty = render(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><NotificationsFeedScreen /></MemoryRouter></QueryClientProvider>,
      )
      await screen.findByText("You're all caught up.")
      await expectNoA11yViolations(empty.container)
      empty.unmount()

      spy.mockRejectedValue(new Error('offline'))
      const failed = render(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><NotificationsFeedScreen /></MemoryRouter></QueryClientProvider>,
      )
      await screen.findByText(/couldn.t load your notifications/i)
      await expectNoA11yViolations(failed.container)
      failed.unmount()

      spy.mockResolvedValue(items)
      const listed = render(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><NotificationsFeedScreen /></MemoryRouter></QueryClientProvider>,
      )
      await screen.findByText('Mass Reminder')
      await expectNoA11yViolations(listed.container)
    })
  })

  describe('website frame', () => {
    const original = window.matchMedia
    afterEach(() => {
      window.matchMedia = original
    })

    it('sits inside the website frame on a desktop', async () => {
      setViewport(1280)
      useAuthStoreForFrame.setState({ user: { id: 'u1', fullName: 'Rita Reyes', email: 'r@example.org', phone: '', address: '' } as never })
      render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <NotificationsFeedScreen />
        </MemoryRouter>
      </QueryClientProvider>,
    )
      expect(await screen.findByRole('navigation', { name: 'Main' })).toBeInTheDocument()
    })

    it('keeps the phone frame without a tab bar on a phone', () => {
      setViewport(390)
      render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <NotificationsFeedScreen />
        </MemoryRouter>
      </QueryClientProvider>,
    )
      expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument()
    })
  })
})
