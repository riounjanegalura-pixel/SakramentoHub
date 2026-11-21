import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom'
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NotificationBell } from './NotificationBell'
import * as notificationsData from '../../lib/data/notifications'
import { LocationProbe, renderWithProviders } from '../../test/render'
import type { AppNotification } from '../../lib/types'

const note = (o: Partial<AppNotification> = {}): AppNotification => ({
  id: 'n1', title: 'Refund due', body: 'FUNE-20261102-AB12 was cancelled after payment.', category: 'today',
  read: false, icon: 'booking', createdAt: '2026-11-02T01:00:00Z', bookingId: null, link: null, ...o,
})

describe('NotificationBell', () => {
  beforeEach(() => vi.restoreAllMocks())
  afterEach(() => vi.useRealTimers())

  it('shows the unread count on the bell', async () => {
    vi.spyOn(notificationsData, 'fetchNotifications').mockResolvedValue([note(), note({ id: 'n2' }), note({ id: 'n3', read: true })])
    renderWithProviders(<NotificationBell />)
    const bell = await screen.findByRole('button', { name: 'Notifications, 2 unread' })
    expect(bell).toHaveTextContent('2') // the count is text, not only a coloured dot
    expect(bell.querySelector('.bg-danger')).not.toBeNull()
  })

  it('has no badge when everything is read, and caps a long count', async () => {
    const spy = vi.spyOn(notificationsData, 'fetchNotifications').mockResolvedValue([note({ read: true })])
    const first = renderWithProviders(<NotificationBell />)
    expect(await screen.findByRole('button', { name: 'Notifications' })).toBeInTheDocument()
    first.unmount()

    spy.mockResolvedValue(Array.from({ length: 120 }, (_, i) => note({ id: `n${i}` })))
    renderWithProviders(<NotificationBell />)
    expect(await screen.findByText('99+')).toBeInTheDocument()
  })

  it('opens a dropdown listing the notifications', async () => {
    vi.spyOn(notificationsData, 'fetchNotifications').mockResolvedValue([note(), note({ id: 'n2', title: 'Urgent anointing request', read: true })])
    renderWithProviders(<NotificationBell />)
    await userEvent.click(await screen.findByRole('button', { name: /^Notifications/ }))

    const panel = screen.getByRole('dialog', { name: 'Notifications' })
    expect(panel).toHaveTextContent('Refund due')
    expect(panel).toHaveTextContent('Urgent anointing request')
    expect(panel).toHaveTextContent('FUNE-20261102-AB12 was cancelled after payment.')
  })

  it('shows "No notifications" when the list is empty', async () => {
    vi.spyOn(notificationsData, 'fetchNotifications').mockResolvedValue([])
    renderWithProviders(<NotificationBell />)
    await userEvent.click(await screen.findByRole('button', { name: 'Notifications' }))
    expect(screen.getByText('No notifications')).toBeInTheDocument()
  })

  it('marks one notification read when an unread one is clicked, but not a read one', async () => {
    vi.spyOn(notificationsData, 'fetchNotifications').mockResolvedValue([note(), note({ id: 'n2', title: 'Old news', read: true })])
    const markOne = vi.spyOn(notificationsData, 'markNotificationRead').mockResolvedValue(undefined)
    renderWithProviders(<NotificationBell />)
    await userEvent.click(await screen.findByRole('button', { name: /^Notifications/ }))

    await userEvent.click(screen.getByRole('button', { name: /Old news/ }))
    expect(markOne).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: /Refund due/ }))
    await waitFor(() => expect(markOne).toHaveBeenCalledWith('n1'))
  })

  it('links a notification that has a booking, marks it read and closes the dropdown', async () => {
    vi.spyOn(notificationsData, 'fetchNotifications').mockResolvedValue([note({ bookingId: 'bk-9' })])
    const markOne = vi.spyOn(notificationsData, 'markNotificationRead').mockResolvedValue(undefined)
    renderWithProviders(<NotificationBell />)
    await userEvent.click(await screen.findByRole('button', { name: /^Notifications/ }))

    const link = screen.getByRole('link', { name: /Refund due/ })
    expect(link).toHaveAttribute('href', '/bookings/bk-9')
    await userEvent.click(link)
    await waitFor(() => expect(markOne).toHaveBeenCalledWith('n1'))
    expect(screen.queryByRole('dialog', { name: 'Notifications' })).not.toBeInTheDocument()
  })

  it('opens the path in link when a notification has one', async () => {
    vi.spyOn(notificationsData, 'fetchNotifications').mockResolvedValue([note({ bookingId: null, link: '/certificate-requests/c1' })])
    const markOne = vi.spyOn(notificationsData, 'markNotificationRead').mockResolvedValue(undefined)
    renderWithProviders(<><NotificationBell /><LocationProbe /></>)
    await userEvent.click(await screen.findByRole('button', { name: /^Notifications/ }))

    const link = screen.getByRole('link', { name: /Refund due/ })
    expect(link).toHaveAttribute('href', '/certificate-requests/c1')
    await userEvent.click(link)
    expect(screen.getByTestId('location')).toHaveTextContent('/certificate-requests/c1')
    await waitFor(() => expect(markOne).toHaveBeenCalledWith('n1'))
    expect(screen.queryByRole('dialog', { name: 'Notifications' })).not.toBeInTheDocument()
  })

  it('prefers link over bookingId', async () => {
    vi.spyOn(notificationsData, 'fetchNotifications').mockResolvedValue([note({ bookingId: 'bk-9', link: '/certificate-requests/c1' })])
    renderWithProviders(<NotificationBell />)
    await userEvent.click(await screen.findByRole('button', { name: /^Notifications/ }))
    expect(screen.getByRole('link', { name: /Refund due/ })).toHaveAttribute('href', '/certificate-requests/c1')
  })

  it('leaves a notification without a booking as a button, not a link', async () => {
    vi.spyOn(notificationsData, 'fetchNotifications').mockResolvedValue([note()])
    renderWithProviders(<NotificationBell />)
    await userEvent.click(await screen.findByRole('button', { name: /^Notifications/ }))
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Refund due/ })).toBeInTheDocument()
  })

  it('marks everything read, and the button goes away when nothing is unread', async () => {
    const fetchSpy = vi.spyOn(notificationsData, 'fetchNotifications').mockResolvedValue([note(), note({ id: 'n2' })])
    const markAll = vi.spyOn(notificationsData, 'markAllNotificationsRead').mockResolvedValue(undefined)
    renderWithProviders(<NotificationBell />)
    await userEvent.click(await screen.findByRole('button', { name: /^Notifications/ }))

    fetchSpy.mockResolvedValue([note({ read: true }), note({ id: 'n2', read: true })])
    await userEvent.click(screen.getByRole('button', { name: 'Mark all read' }))
    await waitFor(() => expect(markAll).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Mark all read' })).not.toBeInTheDocument())
  })

  it('closes on Escape and on a click outside', async () => {
    vi.spyOn(notificationsData, 'fetchNotifications').mockResolvedValue([note()])
    renderWithProviders(<NotificationBell />)
    const bell = await screen.findByRole('button', { name: /^Notifications/ })

    await userEvent.click(bell)
    expect(screen.getByRole('dialog', { name: 'Notifications' })).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Notifications' })).not.toBeInTheDocument()

    await userEvent.click(bell)
    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('dialog', { name: 'Notifications' })).not.toBeInTheDocument()
  })

  it('refetches every 60 seconds', async () => {
    vi.useFakeTimers()
    const spy = vi.spyOn(notificationsData, 'fetchNotifications').mockResolvedValue([])
    renderWithProviders(<NotificationBell />)

    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(spy).toHaveBeenCalledTimes(1)
    await act(async () => { await vi.advanceTimersByTimeAsync(59_000) })
    expect(spy).toHaveBeenCalledTimes(1)
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000) })
    expect(spy).toHaveBeenCalledTimes(2)
  })
})
