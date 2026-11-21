import { beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PaymentPanel } from './PaymentPanel'
import { PaymentDialog } from './PaymentDialog'
import * as bookingsData from '../../lib/data/bookings'
import { renderWithProviders } from '../../test/render'
import { adminBooking } from '../../test/factories'
import type { AdminBooking } from '../../lib/types'

const paid = (o: Partial<AdminBooking> = {}) =>
  adminBooking({ id: 'b1', status: 'approved', paymentStatus: 'paid', amountDueCentavos: 5000, amountPaidCentavos: 15000, overpaidCentavos: 10000, paidAt: '2026-11-02T01:00:00Z', ...o })

const future = () => new Date(Date.now() + 5 * 3600_000).toISOString()
const past = () => new Date(Date.now() - 3600_000).toISOString()

describe('PaymentPanel', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('shows the amount large with a Paid pill and how it was paid', () => {
    renderWithProviders(<PaymentPanel booking={paid({ overpaidCentavos: 0, amountPaidCentavos: 5000 })} onChanged={vi.fn()} onTakePayment={vi.fn()} />)
    expect(screen.getByRole('region', { name: 'Payment' })).toBeInTheDocument()
    expect(screen.getByText('₱50.00')).toBeInTheDocument()
    expect(screen.getByText('Paid')).toBeInTheDocument()
    expect(screen.getByText(/^GCash · /)).toBeInTheDocument()
  })

  it('says a cash payment was cash at the parish office, with its receipt number, not PayMongo', () => {
    renderWithProviders(<PaymentPanel booking={paid({ overpaidCentavos: 0, amountPaidCentavos: 5000, paymentMethod: 'cash', cashReceiptReference: 'OR-77' })} onChanged={vi.fn()} onTakePayment={vi.fn()} />)
    expect(screen.getByText(/^Cash at the parish office · /)).toBeInTheDocument()
    expect(screen.getByText('OR-77')).toBeInTheDocument()
    expect(screen.queryByText(/PayMongo/)).not.toBeInTheDocument()
  })

  it('shows what was paid and the overpayment', () => {
    renderWithProviders(<PaymentPanel booking={paid()} onChanged={vi.fn()} onTakePayment={vi.fn()} />)
    expect(screen.getByText('₱150.00')).toBeInTheDocument()
    expect(screen.getByText('Overpaid by ₱100.00')).toBeInTheDocument()
  })

  it('does not mention overpayment on an exact payment', () => {
    renderWithProviders(<PaymentPanel booking={paid({ amountPaidCentavos: 5000, overpaidCentavos: 0 })} onChanged={vi.fn()} onTakePayment={vi.fn()} />)
    expect(screen.queryByText(/overpaid/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Record partial refund' })).not.toBeInTheDocument()
  })

  it('records a partial refund in centavos', async () => {
    const updated = paid({ overpaidCentavos: 6000, amountRefundedCentavos: 4000 })
    const spy = vi.spyOn(bookingsData, 'recordPartialRefund').mockResolvedValue(updated)
    const onChanged = vi.fn()
    renderWithProviders(<PaymentPanel booking={paid()} onChanged={onChanged} onTakePayment={vi.fn()} />)

    const button = screen.getByRole('button', { name: 'Record partial refund' })
    expect(button).toBeDisabled() // no reference yet
    await userEvent.type(screen.getByLabelText('PayMongo refund reference'), 'PM-1')
    await userEvent.clear(screen.getByLabelText('Amount refunded (₱)'))
    await userEvent.type(screen.getByLabelText('Amount refunded (₱)'), '40')
    await userEvent.click(button)

    await waitFor(() => expect(onChanged).toHaveBeenCalledWith(updated))
    expect(spy).toHaveBeenCalledWith('b1', 'PM-1', 4000)
  })

  it('refuses an amount above the overpayment', async () => {
    renderWithProviders(<PaymentPanel booking={paid()} onChanged={vi.fn()} onTakePayment={vi.fn()} />)
    await userEvent.type(screen.getByLabelText('PayMongo refund reference'), 'PM-1')
    await userEvent.clear(screen.getByLabelText('Amount refunded (₱)'))
    await userEvent.type(screen.getByLabelText('Amount refunded (₱)'), '150')
    expect(screen.getByRole('button', { name: 'Record partial refund' })).toBeDisabled()
    expect(screen.getByText('The refund cannot be more than ₱100.00.')).toBeInTheDocument()
  })

  it('shows the refunded amount and reference on a refunded booking', () => {
    renderWithProviders(
      <PaymentPanel booking={paid({ paymentStatus: 'refunded', status: 'cancelled', overpaidCentavos: 0, amountPaidCentavos: 5000, amountRefundedCentavos: 5000, refundReference: 'PM-9' })} onChanged={vi.fn()} onTakePayment={vi.fn()} />,
    )
    expect(screen.getByText('Amount refunded').nextElementSibling).toHaveTextContent('₱50.00')
    expect(screen.getByText('PM-9')).toBeInTheDocument()
  })

  it('labels a refunded cash payment\'s reference plainly, not as a PayMongo reference', () => {
    renderWithProviders(
      <PaymentPanel booking={paid({ paymentStatus: 'refunded', paymentMethod: 'cash', status: 'cancelled', overpaidCentavos: 0, amountRefundedCentavos: 5000, refundReference: 'OR-1' })} onChanged={vi.fn()} onTakePayment={vi.fn()} />,
    )
    expect(screen.getByText('Refund reference')).toBeInTheDocument()
    expect(screen.queryByText('PayMongo refund reference')).not.toBeInTheDocument()
  })

  it('resets partial refund form fields when overpaidCentavos changes', async () => {
    const { unmount } = renderWithProviders(<PaymentPanel booking={paid({ overpaidCentavos: 10000 })} onChanged={vi.fn()} onTakePayment={vi.fn()} />)
    expect(await screen.findByDisplayValue('100.00')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('PayMongo refund reference'), 'PM-1')
    unmount()
    renderWithProviders(<PaymentPanel booking={paid({ overpaidCentavos: 6000 })} onChanged={vi.fn()} onTakePayment={vi.fn()} />)
    expect(await screen.findByDisplayValue('60.00')).toBeInTheDocument()
    expect(screen.getByLabelText('PayMongo refund reference')).toHaveValue('')
  })

  it('says "No fee" for a booking that needs no payment, and keeps old bookings readable', () => {
    const { unmount } = renderWithProviders(<PaymentPanel booking={paid({ paymentStatus: 'not_required', amountPaidCentavos: null, overpaidCentavos: 0 })} onChanged={vi.fn()} onTakePayment={vi.fn()} />)
    expect(screen.getByText('No fee')).toBeInTheDocument()
    unmount()
    renderWithProviders(<PaymentPanel booking={paid({ paymentStatus: null, amountPaidCentavos: null, overpaidCentavos: 0 })} onChanged={vi.fn()} onTakePayment={vi.fn()} />)
    expect(screen.getByText('Legacy booking (before online payment).')).toBeInTheDocument()
  })

  describe('Take payment', () => {
    const unpaid = (o: Partial<AdminBooking> = {}) =>
      adminBooking({ id: 'b1', status: 'submitted', paymentStatus: 'unpaid', amountDueCentavos: 30000, paymentHoldExpiresAt: future(), ...o })

    it('is offered for an unpaid booking still holding its slot, with the hold in words', async () => {
      const open = vi.fn()
      renderWithProviders(<PaymentPanel booking={unpaid()} onChanged={vi.fn()} onTakePayment={open} />)
      expect(screen.getByText('₱300.00')).toBeInTheDocument()
      expect(screen.getByText(/Waiting for payment\. Hold ends in \d+ hours/)).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Take payment' }))
      expect(open).toHaveBeenCalled()
    })

    it('is offered while cash is pending (the parishioner may still switch to GCash)', () => {
      renderWithProviders(<PaymentPanel booking={unpaid({ paymentStatus: 'pending_cash', paymentMethod: 'cash' })} onChanged={vi.fn()} onTakePayment={vi.fn()} />)
      expect(screen.getByText('Cash pending')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Take payment' })).toBeInTheDocument()
    })

    it('is not offered once paid, when the booking is closed, or when the unpaid hold has lapsed', () => {
      for (const b of [paid({ overpaidCentavos: 0 }), unpaid({ status: 'cancelled' }), unpaid({ paymentHoldExpiresAt: past() })]) {
        const { unmount } = renderWithProviders(<PaymentPanel booking={b} onChanged={vi.fn()} onTakePayment={vi.fn()} />)
        expect(screen.queryByRole('button', { name: 'Take payment' })).not.toBeInTheDocument()
        unmount()
      }
    })
  })
})

describe('PaymentDialog', () => {
  beforeEach(() => vi.restoreAllMocks())
  const unpaid = (o: Partial<AdminBooking> = {}) =>
    adminBooking({ id: 'b1', status: 'submitted', sacrament: 'house-blessing', subjectName: 'Santos family', paymentStatus: 'unpaid', amountDueCentavos: 30000, paymentHoldExpiresAt: future(), ...o })

  function show(b: AdminBooking, onDone = vi.fn()) {
    renderWithProviders(<PaymentDialog booking={b} open onOpenChange={vi.fn()} onDone={onDone} />)
    return { dialog: screen.getByRole('dialog', { name: 'Take payment for Santos family' }), onDone }
  }

  it('offers cash at the office or a GCash link, cash first', () => {
    const { dialog } = show(unpaid())
    expect(within(dialog).getByRole('radiogroup', { name: 'How they pay' })).toBeInTheDocument()
    expect(within(dialog).getByRole('radio', { name: /Cash at the office/ })).toBeChecked()
    expect(within(dialog).getByRole('radio', { name: /GCash link/ })).not.toBeChecked()
    expect(dialog).toHaveTextContent('₱300.00')
  })

  it('records the cash with the receipt number and hands the booking back', async () => {
    const updated = unpaid({ paymentStatus: 'paid' })
    const spy = vi.spyOn(bookingsData, 'markCashReceived').mockResolvedValue(updated)
    const { dialog, onDone } = show(unpaid())
    await userEvent.type(within(dialog).getByLabelText(/^Receipt number/), 'OR-12')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Record cash payment' }))
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(updated))
    expect(spy).toHaveBeenCalledWith('b1', 'OR-12')
  })

  it('records the cash without a receipt number', async () => {
    const spy = vi.spyOn(bookingsData, 'markCashReceived').mockResolvedValue(unpaid())
    const { dialog } = show(unpaid())
    await userEvent.click(within(dialog).getByRole('button', { name: 'Record cash payment' }))
    await waitFor(() => expect(spy).toHaveBeenCalledWith('b1', ''))
  })

  it('shows the server refusal', async () => {
    vi.spyOn(bookingsData, 'markCashReceived').mockRejectedValue(new Error('Already paid.'))
    const { dialog } = show(unpaid())
    await userEvent.click(within(dialog).getByRole('button', { name: 'Record cash payment' }))
    expect(await within(dialog).findByText('Already paid.')).toBeInTheDocument()
  })

  it('tells staff not to take the cash once the hold has lapsed, and cannot record it', () => {
    const { dialog } = show(unpaid({ paymentHoldExpiresAt: past() }))
    expect(within(dialog).getByRole('note')).toHaveTextContent('Do not take the cash')
    expect(within(dialog).getByRole('button', { name: 'Record cash payment' })).toBeDisabled()
  })

  it('says a parishioner who chose cash will pay at the office by the hold', () => {
    const { dialog } = show(unpaid({ paymentStatus: 'pending_cash', paymentMethod: 'cash' }))
    expect(dialog).toHaveTextContent('The parishioner chose to pay at the parish office')
  })

  it('makes a GCash link to copy or open', async () => {
    const spy = vi.spyOn(bookingsData, 'createPaymentLink').mockResolvedValue({ checkoutUrl: 'https://pay.example/abc', checkoutSessionId: 'cs_1' })
    const { dialog } = show(unpaid())
    await userEvent.click(within(dialog).getByRole('radio', { name: /GCash link/ }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Get GCash link' }))
    expect(await within(dialog).findByDisplayValue('https://pay.example/abc')).toHaveAttribute('readonly')
    expect(within(dialog).getByRole('link', { name: 'Open payment page' })).toHaveAttribute('href', 'https://pay.example/abc')
    expect(spy).toHaveBeenCalledWith('b1')
  })

  it('shows the server message when the link cannot be made', async () => {
    vi.spyOn(bookingsData, 'createPaymentLink').mockRejectedValue(new Error('PayMongo is not set up.'))
    const { dialog } = show(unpaid())
    await userEvent.click(within(dialog).getByRole('radio', { name: /GCash link/ }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Get GCash link' }))
    expect(await within(dialog).findByText('PayMongo is not set up.')).toBeInTheDocument()
  })

  it('re-reads the booking when the server refuses because it is already paid', async () => {
    vi.spyOn(bookingsData, 'createPaymentLink').mockRejectedValue(new Error('This booking is already paid.'))
    const { dialog } = show(unpaid())
    await userEvent.click(within(dialog).getByRole('radio', { name: /GCash link/ }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Get GCash link' }))
    expect(await within(dialog).findByText('This booking is already paid.')).toBeInTheDocument()
  })
})
