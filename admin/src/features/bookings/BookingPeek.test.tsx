import { describe, expect, it, vi } from 'vitest'
import { act } from '@testing-library/react'
import '@testing-library/jest-dom'
import { screen, waitFor, within } from '@testing-library/react'
import { expectNoA11yViolations } from '../../test/a11y'
import { LazyMotion, domAnimation } from 'motion/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { BookingPeek } from './BookingPeek'
import { renderWithProviders } from '../../test/render'
import { adminBooking, bookingDocument } from '../../test/factories'

const b = adminBooking({ id: 'b1', referenceNumber: 'BK-20261102-AB12', sacrament: 'baptism', status: 'submitted', user: { fullName: 'Rita Reyes', email: 'rita@example.org', phone: null } })

describe('BookingPeek', () => {
  it('shows the key facts and opens the full booking', async () => {
    const onOpen = vi.fn()
    renderWithProviders(<BookingPeek booking={b} onOpenChange={vi.fn()} onOpen={onOpen} />)
    const dialog = await screen.findByRole('dialog', { name: 'Juana Dela Cruz' })
    expect(dialog).toHaveTextContent('BK-20261102-AB12')
    expect(dialog).toHaveTextContent('Baptism')
    expect(within(dialog).getByText('Awaiting review')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Open booking' }))
    expect(onOpen).toHaveBeenCalledWith('b1')
  })

  it('says what the booking waits for, its payment, and offers a call when there is a number', async () => {
    renderWithProviders(
      <BookingPeek
        booking={{ ...b, subjectName: 'Carla Mendoza', user: { fullName: 'Carla Mendoza', email: null, phone: '09175550107' }, paymentStatus: 'paid', amountDueCentavos: 300000, amountPaidCentavos: 300000, documents: [bookingDocument({ key: 'a' }), bookingDocument({ key: 'b' })], appointmentDate: '2030-12-14', appointmentStart: '10:00', appointmentEnd: '11:00' }}
        onOpenChange={vi.fn()}
        onOpen={vi.fn()}
      />,
    )
    const dialog = await screen.findByRole('dialog', { name: 'Carla Mendoza' })
    expect(within(dialog).getByText('Review 2 documents')).toBeInTheDocument()
    expect(within(dialog).getByText('Paid · ₱3,000.00')).toBeInTheDocument()
    expect(within(dialog).getByText('December 14, 10:00–11:00 AM')).toBeInTheDocument()
    expect(within(dialog).getByRole('link', { name: 'Call Carla' })).toHaveAttribute('href', 'tel:09175550107')
    expect(within(dialog).getAllByRole('button').filter((x) => x.textContent === 'Open booking')).toHaveLength(1)
  })

  it('offers no call when there is no number', async () => {
    renderWithProviders(<BookingPeek booking={b} onOpenChange={vi.fn()} onOpen={vi.fn()} />)
    await screen.findByRole('dialog')
    expect(screen.queryByRole('link', { name: /^Call/ })).not.toBeInTheDocument()
  })

  it('closes from its own Close button', async () => {
    const onOpenChange = vi.fn()
    renderWithProviders(<BookingPeek booking={b} onOpenChange={onOpenChange} onOpen={vi.fn()} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Close' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('has no accessibility violations', async () => {
    renderWithProviders(<BookingPeek booking={b} onOpenChange={vi.fn()} onOpen={vi.fn()} />)
    await screen.findByRole('dialog')
    await expectNoA11yViolations(document.body)
  })

  it('renders nothing when there is no booking', () => {
    renderWithProviders(<BookingPeek booking={null} onOpenChange={vi.fn()} onOpen={vi.fn()} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('asks to close on Escape', async () => {
    const onOpenChange = vi.fn()
    renderWithProviders(<BookingPeek booking={b} onOpenChange={onOpenChange} onOpen={vi.fn()} />)
    await screen.findByRole('dialog')
    await userEvent.keyboard('{Escape}')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('keeps showing the last booking while the sheet slides out, instead of blanking mid-animation', async () => {
    // The sheet now leaves through motion's AnimatePresence, which needs the animation features
    // that the app loads in main.tsx; the unit-test tree gets them from this wrapper.
    const tree = (booking: typeof b | null) => (
      <LazyMotion features={domAnimation}>
        <BookingPeek booking={booking} onOpenChange={vi.fn()} onOpen={vi.fn()} />
      </LazyMotion>
    )
    const { rerender, client } = renderWithProviders(tree(b))
    expect(await screen.findByRole('dialog')).toHaveTextContent('BK-20261102-AB12')
    // rerender must keep the same provider tree, or React remounts and the remembered booking is lost.
    act(() => rerender(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/']}>{tree(null)}</MemoryRouter></QueryClientProvider>))
    expect(screen.getByRole('dialog')).toHaveTextContent('BK-20261102-AB12')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})
