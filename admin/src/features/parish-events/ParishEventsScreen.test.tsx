import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom'
import { ParishEventsScreen } from './ParishEventsScreen'
import * as parishEventsData from '../../lib/data/parish-events'
import * as scheduleData from '../../lib/data/schedule'
import { useAuthStore } from '../../stores/auth-store'
import { expectNoA11yViolations } from '../../test/a11y'
import type { AdminParishEvent, Paginated } from '../../lib/types'

function makeEvent(overrides: Partial<AdminParishEvent> = {}): AdminParishEvent {
  return {
    id: '1',
    title: 'Sunday Mass',
    date: '2026-09-13T08:00:00.000Z',
    location: 'Main Chapel',
    imageUrl: '/mock-assets/sunday-mass.jpg',
    category: 'mass',
    createdBy: 'staff-1',
    createdByName: 'Staff One',
    createdAt: '2026-09-05T00:00:00.000Z',
    updatedAt: '2026-09-05T00:00:00.000Z',
    ...overrides,
  }
}

function makePage(data: AdminParishEvent[]): Paginated<AdminParishEvent> {
  return {
    data,
    links: { first: null, last: null, prev: null, next: null },
    meta: { current_page: 1, last_page: 1, per_page: 10, total: data.length },
  }
}

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ParishEventsScreen />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('ParishEventsScreen', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(scheduleData, 'fetchSchedule').mockResolvedValue({ days: [], unscheduled: [], travelBufferMinutes: 30 } as never)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders parish events returned by the API', async () => {
    vi.spyOn(parishEventsData, 'fetchParishEvents').mockResolvedValue(makePage([makeEvent()]))
    renderScreen()

    await waitFor(() => {
      expect(screen.getByText('Sunday Mass')).toBeInTheDocument()
    })
    expect(screen.getByText(/Sun, Sep 13 · 4:00 PM · Main Chapel/)).toBeInTheDocument()
  })

  it('offers every category by its readable label in the form, and shows the label in the table', async () => {
    vi.spyOn(parishEventsData, 'fetchParishEvents').mockResolvedValue(
      makePage([makeEvent({ id: '1', category: 'feast', title: 'Patron Feast' }), makeEvent({ id: '2', category: 'baptism' as never, title: 'Old row' })]),
    )
    renderScreen()
    await screen.findByText('Patron Feast')
    expect(screen.getAllByText('Feast day').length).toBeGreaterThan(0)
    expect(screen.getAllByText('baptism').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: 'Add event' }))
    const options = Array.from((screen.getByLabelText('Category') as HTMLSelectElement).options).map((o) => [o.value, o.text])
    expect(options).toEqual([
      ['mass', 'Mass'],
      ['feast', 'Feast day'],
      ['seminar', 'Seminar'],
      ['fundraiser', 'Fundraiser'],
      ['community', 'Community'],
      ['notice', 'Notice'],
      ['general', 'Parish event'],
      ['other', 'Other'],
    ])
  })

  it('submits the create-event form and the new event appears after refetch', async () => {
    const fetchSpy = vi.spyOn(parishEventsData, 'fetchParishEvents').mockResolvedValue(makePage([]))
    const createSpy = vi.spyOn(parishEventsData, 'createParishEvent').mockResolvedValue(makeEvent({ title: 'Recollection Day' }))
    renderScreen()
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled())

    fireEvent.click(screen.getByRole('button', { name: 'Add event' }))
    fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: 'Recollection Day' } })
    fireEvent.change(screen.getByLabelText(/^Date/), { target: { value: '2026-09-20' } })
    fireEvent.change(screen.getByLabelText(/^Time/), { target: { value: '09:00' } })
    expect(screen.queryByLabelText(/^Location/)).toBeNull()

    fetchSpy.mockResolvedValue(makePage([makeEvent({ title: 'Recollection Day' })]))
    fireEvent.click(screen.getByRole('button', { name: 'Add event' }))

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Recollection Day', date: '2026-09-20T09:00:00+08:00' }),
        expect.anything(),
      )
    })
    await waitFor(() => {
      expect(screen.getAllByText('Recollection Day').length).toBeGreaterThan(0)
    })
  })

  it('shows the real backend error when creating an event fails', async () => {
    vi.spyOn(parishEventsData, 'fetchParishEvents').mockResolvedValue(makePage([]))
    vi.spyOn(parishEventsData, 'createParishEvent').mockRejectedValue(new Error('The category field is invalid.'))
    renderScreen()

    fireEvent.click(screen.getByRole('button', { name: 'Add event' }))
    fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: 'X' } })
    fireEvent.change(screen.getByLabelText(/^Date/), { target: { value: '2026-09-20' } })
    fireEvent.change(screen.getByLabelText(/^Time/), { target: { value: '09:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add event' }))

    await waitFor(() => {
      expect(screen.getByText('The category field is invalid.')).toBeInTheDocument()
    })
  })

  it('editing an event submits the update', async () => {
    vi.spyOn(parishEventsData, 'fetchParishEvents').mockResolvedValue(makePage([makeEvent()]))
    const updateSpy = vi.spyOn(parishEventsData, 'updateParishEvent').mockResolvedValue(
      makeEvent({ title: 'Sunday Mass (Updated)' }),
    )
    renderScreen()

    await waitFor(() => {
      expect(screen.getByText('Sunday Mass')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Edit Sunday Mass' }))
    fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: 'Sunday Mass (Updated)' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith(
        '1',
        expect.objectContaining({ title: 'Sunday Mass (Updated)' }),
      )
    })
  })

  it('editing an event with a legacy category offers that category, selected, and keeps it on save', async () => {
    vi.spyOn(parishEventsData, 'fetchParishEvents').mockResolvedValue(
      makePage([makeEvent({ id: '2', category: 'baptism' as never, title: 'Baptism Ceremony' })]),
    )
    const updateSpy = vi.spyOn(parishEventsData, 'updateParishEvent').mockResolvedValue(makeEvent({ id: '2' }))
    renderScreen()
    fireEvent.click(await screen.findByRole('button', { name: /^Edit/ }))

    const select = screen.getByLabelText('Category') as HTMLSelectElement
    expect(select.value).toBe('baptism')
    const options = Array.from(select.options).map((o) => [o.value, o.text])
    expect(options).toContainEqual(['baptism', 'baptism'])
    expect(options).toHaveLength(9)

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith('2', expect.objectContaining({ category: 'baptism' }))
    })
  })

  it('editing an event with a listed category adds no extra option', async () => {
    vi.spyOn(parishEventsData, 'fetchParishEvents').mockResolvedValue(makePage([makeEvent({ category: 'feast' })]))
    renderScreen()
    fireEvent.click(await screen.findByRole('button', { name: /^Edit/ }))
    const select = screen.getByLabelText('Category') as HTMLSelectElement
    expect(select.value).toBe('feast')
    expect(select.options).toHaveLength(8)
  })

  it('has no Delete on the list: it lives only inside Edit, behind its own confirmation', async () => {
    vi.spyOn(parishEventsData, 'fetchParishEvents').mockResolvedValue(makePage([makeEvent()]))
    const deleteSpy = vi.spyOn(parishEventsData, 'deleteParishEvent').mockResolvedValue(undefined)
    renderScreen()
    await screen.findByText('Sunday Mass')
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Edit Sunday Mass' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete event' }))
    expect(await screen.findByText('Delete this event?')).toBeInTheDocument()
    expect(deleteSpy).not.toHaveBeenCalled()
    const buttons = screen.getAllByRole('button', { name: 'Delete event' })
    fireEvent.click(buttons[buttons.length - 1])

    await waitFor(() => expect(deleteSpy).toHaveBeenCalledWith('1', expect.anything()))
    expect(await screen.findByRole('status')).toHaveTextContent('Event deleted.')
  })

  it('keeps the event when the delete confirmation is dismissed', async () => {
    vi.spyOn(parishEventsData, 'fetchParishEvents').mockResolvedValue(makePage([makeEvent()]))
    const deleteSpy = vi.spyOn(parishEventsData, 'deleteParishEvent').mockResolvedValue(undefined)
    renderScreen()
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Sunday Mass' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete event' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Keep event' }))
    await waitFor(() => expect(screen.queryByText('Delete this event?')).not.toBeInTheDocument())
    expect(deleteSpy).not.toHaveBeenCalled()
  })

  it('shows the server refusal inside the delete confirmation', async () => {
    vi.spyOn(parishEventsData, 'fetchParishEvents').mockResolvedValue(makePage([makeEvent()]))
    vi.spyOn(parishEventsData, 'deleteParishEvent').mockRejectedValue(new Error('Event not found.'))
    renderScreen()
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Sunday Mass' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete event' }))
    const buttons = await screen.findAllByRole('button', { name: 'Delete event' })
    fireEvent.click(buttons[buttons.length - 1])
    expect(await screen.findByText('Event not found.')).toBeInTheDocument()
  })

  it('asks for upcoming events first and switches to past', async () => {
    const spy = vi.spyOn(parishEventsData, 'fetchParishEvents').mockResolvedValue(makePage([makeEvent()]))
    renderScreen()
    await screen.findByText('Sunday Mass')
    expect(spy).toHaveBeenCalledWith(1, 'upcoming')
    expect(screen.getByRole('tab', { name: /^Upcoming/ })).toHaveAttribute('aria-selected', 'true')

    fireEvent.click(screen.getByRole('tab', { name: /^Past/ }))
    await waitFor(() => expect(spy).toHaveBeenCalledWith(1, 'past'))
    expect(screen.getByRole('tab', { name: /^Past/ })).toHaveAttribute('aria-selected', 'true')
  })

  it('words the empty state for the chosen filter', async () => {
    vi.spyOn(parishEventsData, 'fetchParishEvents').mockResolvedValue(makePage([]))
    renderScreen()
    expect(await screen.findByText('No upcoming events')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: /^Past/ }))
    expect(await screen.findByText('No past events')).toBeInTheDocument()
  })

  it('a staff-role user (not just admin) can reach and use this screen', async () => {
    useAuthStore.setState({
      user: { id: 'staff-1', fullName: 'Staff One', email: 'staff@x.com', phone: '', address: '', role: 'staff', isActive: true },
      isBootstrapping: false,
    })
    vi.spyOn(parishEventsData, 'fetchParishEvents').mockResolvedValue(makePage([]))
    const createSpy = vi.spyOn(parishEventsData, 'createParishEvent').mockResolvedValue(makeEvent())
    renderScreen()

    fireEvent.click(screen.getByRole('button', { name: 'Add event' }))
    fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: 'Feast Day Mass' } })
    fireEvent.change(screen.getByLabelText(/^Date/), { target: { value: '2026-09-20' } })
    fireEvent.change(screen.getByLabelText(/^Time/), { target: { value: '09:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add event' }))

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalled()
    })
  })

  it('has no accessibility violations, with the form open and with the list', async () => {
    vi.spyOn(parishEventsData, 'fetchParishEvents').mockResolvedValue(makePage([makeEvent()]))
    const { container } = renderScreen()
    await screen.findByText('Sunday Mass')
    fireEvent.click(screen.getByRole('button', { name: 'Add event' }))
    await expectNoA11yViolations(container, { fullPage: true })
  })

  it('marks required fields in words and keeps the labels linked', async () => {
    vi.spyOn(parishEventsData, 'fetchParishEvents').mockResolvedValue(makePage([]))
    renderScreen()
    fireEvent.click(await screen.findByRole('button', { name: 'Add event' }))
    expect(screen.getByLabelText(/^Title/)).toBeRequired()
    expect(screen.getAllByText('Required')).toHaveLength(3)
    expect(screen.getByLabelText(/^Image link/)).not.toBeRequired()
  })

  it('shows a failed save as an alert beside the form', async () => {
    vi.spyOn(parishEventsData, 'fetchParishEvents').mockResolvedValue(makePage([]))
    vi.spyOn(parishEventsData, 'createParishEvent').mockRejectedValue(new Error('The category field is invalid.'))
    renderScreen()
    fireEvent.click(await screen.findByRole('button', { name: 'Add event' }))
    fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: 'X' } })
    fireEvent.change(screen.getByLabelText(/^Date/), { target: { value: '2026-09-20' } })
    fireEvent.change(screen.getByLabelText(/^Time/), { target: { value: '09:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add event' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('The category field is invalid.')
  })

  it('names what was saved', async () => {
    vi.spyOn(parishEventsData, 'fetchParishEvents').mockResolvedValue(makePage([makeEvent()]))
    vi.spyOn(parishEventsData, 'updateParishEvent').mockResolvedValue(makeEvent({ title: 'Sunday Mass (Updated)' }))
    renderScreen()
    fireEvent.click(await screen.findByRole('button', { name: /^Edit/ }))
    fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: 'Sunday Mass (Updated)' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Event saved.')
  })

  it('shows a busy skeleton while loading and an empty message when there are none', async () => {
    vi.spyOn(parishEventsData, 'fetchParishEvents').mockReturnValueOnce(new Promise(() => {}))
    const first = renderScreen()
    await screen.findByRole('status', { name: 'Loading events' })
    expect(screen.getByRole('status', { name: 'Loading events' })).toHaveAttribute('aria-busy', 'true')
    first.unmount()
    vi.spyOn(parishEventsData, 'fetchParishEvents').mockResolvedValue(makePage([]))
    renderScreen()
    expect(await screen.findByText('No upcoming events')).toBeInTheDocument()
  })

  it('offers a retry that asks the server again', async () => {
    const spy = vi.spyOn(parishEventsData, 'fetchParishEvents').mockRejectedValueOnce(new Error('Events are down')).mockResolvedValue(makePage([makeEvent()]))
    renderScreen()
    expect(await screen.findByText(/Events are down/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Sunday Mass')).toBeInTheDocument()
    expect(spy.mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('does not repeat the booked sacraments: the Schedule screen is where they are', async () => {
    vi.spyOn(parishEventsData, 'fetchParishEvents').mockResolvedValue(makePage([]))
    renderScreen()
    await screen.findByText('No upcoming events')
    expect(screen.queryByRole('region', { name: 'Booked sacraments' })).not.toBeInTheDocument()
  })
})

describe('ParishEventsScreen form checks', () => {
  it('says what is missing in words and does not send an empty form', async () => {
    vi.spyOn(parishEventsData, 'fetchParishEvents').mockResolvedValue(makePage([]))
    const createSpy = vi.spyOn(parishEventsData, 'createParishEvent').mockResolvedValue(makeEvent())
    renderScreen()
    fireEvent.click(await screen.findByRole('button', { name: 'Add event' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Add event' }).pop()!)
    expect(await screen.findByText('Enter a title.')).toBeInTheDocument()
    expect(screen.getByLabelText(/^Title/)).toHaveAttribute('aria-invalid', 'true')
    expect(createSpy).not.toHaveBeenCalled()
  })

  it('sends the Other category', async () => {
    vi.spyOn(parishEventsData, 'fetchParishEvents').mockResolvedValue(makePage([]))
    const createSpy = vi.spyOn(parishEventsData, 'createParishEvent').mockResolvedValue(makeEvent())
    renderScreen()
    fireEvent.click(await screen.findByRole('button', { name: 'Add event' }))
    fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: 'Clean-up day' } })
    fireEvent.change(screen.getByLabelText(/^Date/), { target: { value: '2026-09-20' } })
    fireEvent.change(screen.getByLabelText(/^Time/), { target: { value: '09:00' } })
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'other' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Add event' }).pop()!)
    await waitFor(() => expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({ category: 'other', date: '2026-09-20T09:00:00+08:00' }), expect.anything()))
  })
})
