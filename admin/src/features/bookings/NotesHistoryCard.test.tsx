import { beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NotesHistoryCard } from './NotesHistoryCard'
import * as bookingsData from '../../lib/data/bookings'
import { renderWithProviders } from '../../test/render'
import type { AuditLogEntry, BookingNote } from '../../lib/types'

const note = (o: Partial<BookingNote> = {}): BookingNote => ({
  id: 1, body: 'Called the family, no answer.', author: { id: 's1', fullName: 'Staff One' }, createdAt: '2026-11-02T01:00:00Z', ...o,
})
const entry = (action: string, metadata: Record<string, unknown> = {}, o: Partial<AuditLogEntry> = {}): AuditLogEntry => ({
  id: action, action, subjectType: 'booking', subjectId: 'b1', metadata,
  actor: { id: 's1', fullName: 'Staff One', email: 's@example.com' }, createdAt: '2026-11-02T01:00:00Z', ...o,
})

describe('NotesHistoryCard', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(bookingsData, 'fetchBookingHistory').mockResolvedValue([])
  })

  describe('notes', () => {
    it('lists notes with author and time, counts them on the tab, and says they are staff-only', async () => {
      vi.spyOn(bookingsData, 'fetchBookingNotes').mockResolvedValue([note(), note({ id: 2, body: 'Reached them at 3 PM.', author: null })])
      renderWithProviders(<NotesHistoryCard bookingId="b1" />)

      expect(await screen.findByText('Called the family, no answer.')).toBeInTheDocument()
      expect(screen.getByText('Reached them at 3 PM.')).toBeInTheDocument()
      expect(screen.getByText(/Staff One/)).toBeInTheDocument()
      expect(screen.getByText(/Former staff member/)).toBeInTheDocument()
      expect(screen.getByText(/Never shown to the parishioner/)).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: 'Notes 2' })).toHaveAttribute('aria-selected', 'true')
      expect(screen.queryByRole('button', { name: /edit|delete/i })).not.toBeInTheDocument()
    })

    it('shows an empty state', async () => {
      vi.spyOn(bookingsData, 'fetchBookingNotes').mockResolvedValue([])
      renderWithProviders(<NotesHistoryCard bookingId="b1" />)
      expect(await screen.findByText('No notes yet.')).toBeInTheDocument()
    })

    it('adds a note, clears the box and reloads the list', async () => {
      const fetchSpy = vi.spyOn(bookingsData, 'fetchBookingNotes').mockResolvedValue([])
      const addSpy = vi.spyOn(bookingsData, 'addBookingNote').mockResolvedValue(note())
      renderWithProviders(<NotesHistoryCard bookingId="b1" />)
      await screen.findByText('No notes yet.')

      const button = screen.getByRole('button', { name: 'Add' })
      expect(button).toBeDisabled()
      const box = screen.getByLabelText('New note')
      await userEvent.type(box, '  Called the family  ')
      await userEvent.click(button)

      await waitFor(() => expect(addSpy).toHaveBeenCalledWith('b1', 'Called the family'))
      await waitFor(() => expect(box).toHaveValue(''))
      await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2))
    })

    it('shows the server error when saving fails', async () => {
      vi.spyOn(bookingsData, 'fetchBookingNotes').mockResolvedValue([])
      vi.spyOn(bookingsData, 'addBookingNote').mockRejectedValue(new Error('Server unavailable'))
      renderWithProviders(<NotesHistoryCard bookingId="b1" />)
      await userEvent.type(await screen.findByLabelText('New note'), 'x')
      await userEvent.click(screen.getByRole('button', { name: 'Add' }))
      expect(await screen.findByText('Server unavailable')).toBeInTheDocument()
    })

    it('says in words when the notes did not load', async () => {
      vi.spyOn(bookingsData, 'fetchBookingNotes').mockRejectedValue(new Error('Network unreachable'))
      renderWithProviders(<NotesHistoryCard bookingId="b1" />)
      expect(await screen.findByText(/The notes did not load: Network unreachable/)).toBeInTheDocument()
    })
  })

  describe('history', () => {
    it('shows a timeline with the actor, and System for automatic entries', async () => {
      vi.spyOn(bookingsData, 'fetchBookingNotes').mockResolvedValue([])
      vi.spyOn(bookingsData, 'fetchBookingHistory').mockResolvedValue([
        entry('booking.submitted'),
        entry('booking.payment_confirmed', {}, { id: 'p', actor: { id: null, fullName: null, email: null } }),
        entry('booking.returned', { note: 'Fix the address' }, { id: 'r' }),
      ])
      renderWithProviders(<NotesHistoryCard bookingId="b1" />)
      await userEvent.click(await screen.findByRole('tab', { name: /History/ }))

      expect(await screen.findByText('Fix the address')).toBeInTheDocument()
      expect(screen.getAllByRole('listitem')).toHaveLength(3)
      expect(screen.getByText(/System/)).toBeInTheDocument()
      expect(screen.getAllByText(/Staff One/)).toHaveLength(2)
      expect(screen.getByRole('tab', { name: 'History 3' })).toHaveAttribute('aria-selected', 'true')
    })

    it('shows an empty state', async () => {
      vi.spyOn(bookingsData, 'fetchBookingNotes').mockResolvedValue([])
      renderWithProviders(<NotesHistoryCard bookingId="b1" />)
      await userEvent.click(await screen.findByRole('tab', { name: /History/ }))
      expect(await screen.findByText('Nothing has happened to this booking yet.')).toBeInTheDocument()
    })

    it('shows the server error', async () => {
      vi.spyOn(bookingsData, 'fetchBookingNotes').mockResolvedValue([])
      vi.spyOn(bookingsData, 'fetchBookingHistory').mockRejectedValue(new Error('Network unreachable'))
      renderWithProviders(<NotesHistoryCard bookingId="b1" />)
      await userEvent.click(await screen.findByRole('tab', { name: /History/ }))
      expect(await screen.findByText(/The history did not load: Network unreachable/)).toBeInTheDocument()
    })
  })

  it('moves between the tabs with the arrow keys', async () => {
    vi.spyOn(bookingsData, 'fetchBookingNotes').mockResolvedValue([])
    renderWithProviders(<NotesHistoryCard bookingId="b1" />)
    const notes = await screen.findByRole('tab', { name: /Notes/ })
    notes.focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: /History/ })).toHaveFocus()
    expect(screen.getByRole('tab', { name: /History/ })).toHaveAttribute('aria-selected', 'true')
    await userEvent.keyboard('{ArrowLeft}')
    expect(screen.getByRole('tab', { name: /Notes/ })).toHaveAttribute('aria-selected', 'true')
  })
})
