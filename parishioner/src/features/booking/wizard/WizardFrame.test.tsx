import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { BookingWizard } from './BookingWizard'
import { useAuthStore } from '../../../stores/auth-store'
import { useBookingStore } from '../../../stores/booking-store'
import { useServerErrorsStore } from '../../../stores/server-errors-store'
import { fetchServices } from '../../../lib/data/services'
import { fetchWallet } from '../../../lib/data/wallet'
import { addDaysYmd, parishToday } from '../../../lib/domain'
import { setViewport } from '../../../test/viewport'
import { expectNoA11yViolations } from '../../../test/a11y'
import type { Service } from '../../../lib/types'

vi.mock('../../../lib/data/availability', () => ({
  fetchAvailabilityDays: vi.fn(async (_s: string, start: string, end: string) => {
    const days = []
    for (let d = new Date(`${start}T00:00:00`); d <= new Date(`${end}T00:00:00`); d.setDate(d.getDate() + 1)) {
      days.push({ date: d.toISOString().slice(0, 10), status: 'free', reason: null, freeCount: 2 })
    }
    return days
  }),
  fetchDayAvailability: vi.fn(async (_s: string, date: string) => ({ date, status: 'free', reason: null, freeStarts: ['09:00', '10:00'] })),
}))
const SERVICES = [
  { id: 'house-blessing', name: 'House Blessing', sessionTimes: null, durationMinutes: 45 },
  { id: 'baptism', name: 'Baptism', sessionTimes: null, durationMinutes: 60 },
]
vi.mock('../../../lib/data/services', () => ({ fetchServices: vi.fn(async () => SERVICES) }))
vi.mock('../../../lib/data/parish', () => ({
  fetchParishInfo: vi.fn(async () => ({ name: 'St. Peter', phone: '09123456789', priestName: 'Fr. X', workingHours: { start: '08:00', end: '17:00' } })),
}))
vi.mock('../../../lib/data/requirements', async () => {
  const m = await import('../../../lib/mock/requirements')
  return { fetchRequirements: vi.fn(async (id: string) => m.fetchRequirements(id)) }
})
vi.mock('../../../lib/mock/latency', async (orig) => ({ ...(await orig<object>()), simulateLatency: async () => {} }))
vi.mock('../../../lib/data/wallet', () => ({ fetchWallet: vi.fn(async () => []), addWalletDocumentFile: vi.fn(), addWalletDocumentByUrl: vi.fn(), deleteWalletDocument: vi.fn() }))
vi.mock('../../../lib/data/documents', () => ({ uploadDocument: vi.fn(async () => ({ url: '/files/x.pdf' })), fetchDocumentFile: vi.fn() }))
vi.mock('../../../lib/data/bookings', () => ({
  saveDraft: vi.fn(async () => ({ id: 'b1', amountDueCentavos: 0, paymentStatus: null })),
  updateDraft: vi.fn(async (id: string) => ({ id, amountDueCentavos: 0, paymentStatus: null })),
  submitBooking: vi.fn(),
  fetchBooking: vi.fn(),
}))
vi.mock('../../../lib/data/walkIns', () => ({
  lookupParishioner: vi.fn(),
  createWalkIn: vi.fn(),
  updateWalkIn: vi.fn(),
  submitWalkIn: vi.fn(),
  fetchDeskBooking: vi.fn(),
}))

function renderWizard(path: string) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/booking/:sacrament/:step" element={<BookingWizard />} />
          <Route path="/desk/:sacrament/:step" element={<BookingWizard mode="desk" />} />
          <Route path="/services" element={<p>Services page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function validHouseBlessing() {
  useBookingStore.getState().startBooking('house-blessing')
  useBookingStore.getState().updateFormData({ bookingFor: 'self', propertyType: 'vehicle', propertyOwner: 'Ricardo Dalisay', vehiclePlate: 'NBC 1234' })
  useBookingStore.getState().setAppointment(addDaysYmd(parishToday(), 7), '10:00')
}

const footerOf = (el: HTMLElement) => el.closest('[data-chrome~="wizard-footer"]') as HTMLElement | null

class Observer {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return []
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  setViewport(390)
  vi.stubGlobal('ResizeObserver', Observer)
  useBookingStore.getState().reset()
  useServerErrorsStore.getState().clear()
  useAuthStore.setState({
    user: { id: 'u1', fullName: 'Ricardo Dalisay', email: 'r@example.com', phone: '09170000000', address: '', emailVerifiedAt: '2026-01-01' },
    isBootstrapping: false,
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
  setViewport(390)
})

describe('wizard frame on a phone', () => {
  it('draws one Continue button in a fixed footer outside the animated main, the wide 52 px primary, and nothing else beside it', async () => {
    renderWizard('/booking/house-blessing/2')
    const cont = await screen.findByRole('button', { name: 'Continue' })
    expect(screen.getByRole('main')).not.toContainElement(cont)
    const footer = footerOf(cont)
    expect(footer).not.toBeNull()
    expect(footer!.className).toMatch(/\bfixed\b/)
    expect(within(footer!).getAllByRole('button')).toHaveLength(1)
    expect(within(footer!).queryByRole('button', { name: /cancel|discard/i })).toBeNull()
    expect(cont.className).toMatch(/min-h-\[56px\]/)
    expect(cont.className).toMatch(/flex-1/)
    expect(cont.className).toMatch(/bg-navy/)
  })

  it('puts "Discard draft" in the header, away from the thumb zone, and asks before throwing anything away', async () => {
    const user = userEvent.setup()
    renderWizard('/booking/house-blessing/2')
    await screen.findByRole('button', { name: 'Continue' })
    const discard = screen.getByRole('button', { name: 'Discard draft' })
    expect(footerOf(screen.getByRole('button', { name: 'Continue' }))).not.toContainElement(discard)
    expect(discard.compareDocumentPosition(screen.getByRole('main')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    await user.click(discard)
    expect(await screen.findByText('Discard this draft?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Keep editing' })).toBeInTheDocument()
  })

  it('tabs through the step body first and then reaches Continue last, matching the visual order', async () => {
    const user = userEvent.setup()
    renderWizard('/booking/house-blessing/2')
    const cont = await screen.findByRole('button', { name: 'Continue' })
    const main = screen.getByRole('main')
    expect(main.compareDocumentPosition(cont) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const last = [...main.querySelectorAll<HTMLElement>('input, button, select, textarea, a[href]')].at(-1)
    last?.focus()
    await user.tab()
    expect(cont).toHaveFocus()
  })

  it('keeps a focused field out from under the footer: the step body is padded by --wizard-footer and the page scroll-padding uses it', async () => {
    renderWizard('/booking/house-blessing/3')
    await screen.findByRole('heading', { name: /what will be blessed/i })
    const body = document.querySelector('[data-slot="wizard-step-body"]') as HTMLElement
    expect(body.className).toMatch(/pb-\[var\(--wizard-footer\)\]/)
    const css = readFileSync(join(import.meta.dirname, '../../../styles/globals.css'), 'utf8')
    expect(css).toMatch(/--wizard-footer:\s*calc\([^;]*env\(safe-area-inset-bottom\)\)/)
    expect(css).toMatch(/html:has\(\[data-chrome~="wizard-footer"\]\)\s*\{\s*scroll-padding-bottom:\s*var\(--wizard-footer\)/)
  })

  it('shows the segmented progress list with the current step marked', async () => {
    renderWizard('/booking/house-blessing/3')
    await screen.findByRole('heading', { name: /what will be blessed/i })
    const list = screen.getByRole('list', { name: 'Booking steps' })
    expect(within(list).getByText('Property').closest('[aria-current="step"]')).not.toBeNull()
    expect(screen.getByText('Step 3 of 4')).toBeInTheDocument()
  })

  it('opens each step with its sacrament emblem and the step name as the entry title', async () => {
    const { container } = renderWizard('/booking/house-blessing/3')
    await screen.findByRole('heading', { name: /what will be blessed/i })
    const entry = container.querySelector('[data-slot="step-entry"]')!
    expect(entry.querySelector('[data-slot="emblem"]')).not.toBeNull()
    expect(entry.querySelector('h2')).toHaveTextContent('Property')
    expect(entry.querySelector('h2')).toHaveClass('text-display-xl', 'font-display')
  })

  it('says the step in words under the progress bar: "Step 3 of 4 · Property"', async () => {
    renderWizard('/booking/house-blessing/3')
    await screen.findByRole('heading', { name: /what will be blessed/i })
    expect(screen.getByText('Step 3 of 4').parentElement).toHaveTextContent('Step 3 of 4 · Property')
  })

  it('has no axe violations in the frame', async () => {
    const { container } = renderWizard('/booking/house-blessing/2')
    await screen.findByRole('heading', { name: /who is this booking for/i })
    await expectNoA11yViolations(container)
  })
})

describe('errors on Continue', () => {
  it('with one or two problems shows them on their own fields only: no summary, each announced, focus on the first', async () => {
    const user = userEvent.setup()
    renderWizard('/booking/house-blessing/3')
    await screen.findByRole('heading', { name: /what will be blessed/i })
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    await waitFor(() => expect(document.activeElement).toHaveAttribute('name', 'propertyType'))
    expect(screen.queryByRole('heading', { name: /check \d+ answers?/i })).not.toBeInTheDocument()
    const owner = screen.getByLabelText(/owner's full name/i)
    expect(owner).toHaveAttribute('aria-invalid', 'true')
    const errorEl = document.getElementById(owner.getAttribute('aria-describedby')!.split(' ').pop()!)!
    expect(errorEl).toHaveTextContent("Enter the owner's name")
    expect(errorEl).toHaveAttribute('role', 'alert')
    expect(document.getElementById('propertyType-error')).toHaveAttribute('role', 'alert')
  })

  it('with three or more problems folds a summary into one line, links to each field, and is the only alert', async () => {
    const user = userEvent.setup()
    useBookingStore.getState().startBooking('baptism')
    useBookingStore.getState().updateFormData({ bookingFor: 'other', relationship: 'parent' })
    renderWizard('/booking/baptism/3')
    await screen.findByRole('heading', { name: /person to be baptized/i })
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    const heading = await screen.findByRole('heading', { name: /check \d+ answers/i })
    const summary = heading.closest('[role="alert"]') as HTMLElement
    expect(screen.getAllByRole('alert')).toEqual([summary])
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText(/first name/i)))
    // The list is folded away until asked for, so the summary costs one line.
    const details = summary.querySelector('details') as HTMLDetailsElement
    expect(details.open).toBe(false)
    await user.click(within(summary).getByText('Show what to fix'))
    expect(details.open).toBe(true)
    const links = within(summary).getAllByRole('link')
    expect(links.length).toBeGreaterThanOrEqual(3)
    expect(links.map((l) => l.textContent)).toContain('Enter the first name')

    await user.click(within(summary).getByRole('link', { name: 'Enter the last name' }))
    expect(screen.getByLabelText(/last name/i)).toHaveFocus()
    // The field's own message stays visible and linked, but is not announced a second time.
    const first = screen.getByLabelText(/first name/i)
    const errorEl = document.getElementById(first.getAttribute('aria-describedby')!.split(' ').pop()!)!
    expect(errorEl).toBeVisible()
    expect(errorEl).not.toHaveAttribute('role')
  })

  it('moves focus only for a new Continue, never on later re-renders', async () => {
    const user = userEvent.setup()
    renderWizard('/booking/house-blessing/3')
    await screen.findByRole('heading', { name: /what will be blessed/i })
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await waitFor(() => expect(document.activeElement).toHaveAttribute('name', 'propertyType'))

    // The person moves on by themselves; typing changes the errors and re-renders the step.
    const owner = screen.getByLabelText(/owner's full name/i)
    await user.click(owner)
    await user.type(owner, 'Maria')
    await waitFor(() => expect(owner).not.toHaveAttribute('aria-invalid', 'true'))
    expect(owner).toHaveFocus()

    // A new Continue moves focus again, to what is still wrong.
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await waitFor(() => expect(document.activeElement).toHaveAttribute('name', 'propertyType'))
  })

  it('puts a server refusal on its field and in the summary, and focuses that field', async () => {
    useBookingStore.getState().startBooking('house-blessing')
    useBookingStore.getState().updateFormData({ bookingFor: 'self', propertyType: 'vehicle', propertyOwner: 'Ricardo Dalisay', vehiclePlate: 'NBC 1234' })
    useServerErrorsStore.getState().setAll({ property: [{ path: 'vehiclePlate', message: 'The parish register rejects that plate number.' }] })
    renderWizard('/booking/house-blessing/3')

    const heading = await screen.findByRole('heading', { name: /could not accept this step/i })
    const summary = heading.closest('[role="alert"]') as HTMLElement
    expect(within(summary).getByRole('link', { name: 'The parish register rejects that plate number.' })).toBeInTheDocument()
    const plate = screen.getByLabelText(/plate number/i)
    await waitFor(() => expect(plate).toHaveAttribute('aria-invalid', 'true'))
    expect(document.getElementById(plate.getAttribute('aria-describedby')!.split(' ').pop()!)).toHaveTextContent('The parish register rejects that plate number.')
    await waitFor(() => expect(plate).toHaveFocus())
    expect(plate).toHaveValue('NBC 1234')
  })

  it('a sacrament form (baptism child) has visible labels stating Required, and no axe violations with errors shown', async () => {
    const user = userEvent.setup()
    useBookingStore.getState().startBooking('baptism')
    useBookingStore.getState().updateFormData({ bookingFor: 'other', relationship: 'parent' })
    const { container } = renderWizard('/booking/baptism/3')
    await screen.findByRole('heading', { name: /person to be baptized/i })
    const first = screen.getByLabelText(/first name/i)
    const label = container.querySelector(`label[for="${first.id}"]`) as HTMLElement
    expect(label).toHaveTextContent('Required')
    await expectNoA11yViolations(container)

    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await screen.findByRole('heading', { name: /check \d+ answers?/i })
    expect(first).toHaveAttribute('aria-invalid', 'true')
    await waitFor(() => expect(document.activeElement).toBe(first))
    await expectNoA11yViolations(container)
  })
})

describe('schedule step', () => {
  it('shows a calendar-shaped skeleton while the service loads, then the calendar', async () => {
    let resolve: (s: Service[]) => void = () => {}
    vi.mocked(fetchServices).mockImplementationOnce(() => new Promise<Service[]>((r) => (resolve = r)))
    validHouseBlessing()
    const { container } = renderWizard('/booking/house-blessing/1')
    await screen.findByRole('heading', { name: /choose a date and time/i })
    expect(screen.getByText('Loading the calendar…')).toBeInTheDocument()
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull()
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(6)
    resolve(SERVICES as unknown as Service[])
    expect(await screen.findByRole('radio', { name: '10:00 AM' })).toBeInTheDocument()
  })

  it('says what happened when the service cannot load and retries', async () => {
    const user = userEvent.setup()
    vi.mocked(fetchServices).mockRejectedValueOnce(new Error('down'))
    validHouseBlessing()
    renderWizard('/booking/house-blessing/1')
    expect(await screen.findByText(/couldn't load this service's schedule/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /try again/i }))
    expect(await screen.findByRole('radio', { name: '10:00 AM' })).toBeInTheDocument()
  })

  it('has no axe violations', async () => {
    validHouseBlessing()
    const { container } = renderWizard('/booking/house-blessing/1')
    await screen.findByRole('radio', { name: '10:00 AM' })
    await expectNoA11yViolations(container)
  })
})

describe('review step', () => {
  it('puts the submit action in the one fixed footer, alone, and has no axe violations', async () => {
    validHouseBlessing()
    const { container } = renderWizard('/booking/house-blessing/4')
    await screen.findByText(/no fee/i)
    const submit = screen.getByRole('button', { name: /submit booking/i })
    expect(screen.getByRole('main')).not.toContainElement(submit)
    expect(within(footerOf(submit)!).getAllByRole('button')).toHaveLength(1)
    expect(submit.className).toMatch(/min-h-\[56px\]/)
    await expectNoA11yViolations(container)
  })
})

describe('What to bring', () => {
  it('on a phone opens a drawer with the documents list from the documents step, and returns focus on close', async () => {
    const user = userEvent.setup()
    useBookingStore.getState().startBooking('baptism')
    renderWizard('/booking/baptism/7')
    await screen.findByRole('heading', { name: /requirements/i })
    const trigger = screen.getByRole('button', { name: 'What to bring' })
    await user.click(trigger)
    const dialog = await screen.findByRole('dialog', { name: 'What to bring' })
    expect(dialog.getAttribute('data-slot')).toBe('drawer-content')
    expect(await within(dialog).findByText('PSA birth certificate')).toBeInTheDocument()
    expect(within(dialog).getByRole('list', { name: 'Documents' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(document.activeElement).toBe(trigger))
  })

  it('on a desktop opens a dialog instead', async () => {
    const user = userEvent.setup()
    setViewport(1280)
    useBookingStore.getState().startBooking('baptism')
    renderWizard('/booking/baptism/7')
    await screen.findByRole('heading', { name: /requirements/i, level: 2 })
    await user.click(screen.getByRole('button', { name: 'What to bring' }))
    const dialog = await screen.findByRole('dialog', { name: 'What to bring' })
    expect(dialog.getAttribute('data-slot')).toBe('dialog-content')
  })

  it('ticks what the parishioner wallet already holds', async () => {
    const user = userEvent.setup()
    vi.mocked(fetchWallet).mockResolvedValue([
      { id: 'w1', kind: 'birth_certificate', personName: 'Ana', fileUrl: '/f', originalName: 'a.pdf', mime: 'application/pdf', sizeBytes: 1, createdAt: '2026-10-01T00:00:00Z' },
    ] as never)
    useBookingStore.getState().startBooking('baptism')
    renderWizard('/booking/baptism/7')
    await screen.findByRole('heading', { name: /requirements/i })
    await user.click(screen.getByRole('button', { name: 'What to bring' }))
    const dialog = await screen.findByRole('dialog', { name: 'What to bring' })
    expect(await within(dialog).findByText('In your documents')).toBeInTheDocument()
    expect(fetchWallet).toHaveBeenCalled()
  })

  it('at the office desk never reads a wallet (staff have none) and ticks nothing', async () => {
    const user = userEvent.setup()
    vi.mocked(fetchWallet).mockResolvedValue([
      { id: 'w1', kind: 'birth_certificate', personName: 'Staff', fileUrl: '/f', originalName: 'a.pdf', mime: 'application/pdf', sizeBytes: 1, createdAt: '2026-10-01T00:00:00Z' },
    ] as never)
    renderWizard('/desk/baptism/7')
    await screen.findByRole('heading', { name: /requirements/i })
    await user.click(screen.getByRole('button', { name: 'What to bring' }))
    const dialog = await screen.findByRole('dialog', { name: 'What to bring' })
    expect(await within(dialog).findByText('PSA birth certificate')).toBeInTheDocument()
    expect(within(dialog).queryByText('In your documents')).not.toBeInTheDocument()
    expect(fetchWallet).not.toHaveBeenCalled()
  })

  it('is not offered on steps without documents', async () => {
    renderWizard('/booking/house-blessing/3')
    await screen.findByRole('heading', { name: /what will be blessed/i })
    expect(screen.queryByRole('button', { name: 'What to bring' })).not.toBeInTheDocument()
  })
})

describe('wizard frame on a desktop', () => {
  it('keeps Continue at the end of the step, not in a fixed footer', async () => {
    setViewport(1280)
    renderWizard('/booking/house-blessing/2')
    const cont = await screen.findByRole('button', { name: 'Continue' })
    expect(footerOf(cont)).toBeNull()
  })
})

describe('schedule step Continue', () => {
  it('is never disabled: pressing it with no date and time says what is missing instead', async () => {
    const user = userEvent.setup()
    useBookingStore.getState().startBooking('house-blessing')
    useBookingStore.getState().updateFormData({ bookingFor: 'self', propertyType: 'vehicle', propertyOwner: 'Ricardo Dalisay', vehiclePlate: 'NBC 1234' })
    renderWizard('/booking/house-blessing/1')
    const cont = await screen.findByRole('button', { name: 'Continue' })
    expect(cont).toBeEnabled()
    await user.click(cont)
    expect(await screen.findByRole('alert')).toHaveTextContent('Choose a date and a time to continue.')
  })
})
