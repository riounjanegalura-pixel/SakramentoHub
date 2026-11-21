import { afterEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DonateDialog } from './DonateDialog'
import * as donations from '../../lib/data/donations'
import { expectNoA11yViolations } from '../../test/a11y'

function renderDialog(onClose = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <DonateDialog open onClose={onClose} />
    </QueryClientProvider>,
  )
  return onClose
}

describe('DonateDialog', () => {
  afterEach(() => vi.restoreAllMocks())

  it('renders nothing when closed', () => {
    const client = new QueryClient()
    render(
      <QueryClientProvider client={client}>
        <DonateDialog open={false} onClose={vi.fn()} />
      </QueryClientProvider>,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('first asks for an amount, with one-tap amounts and an Other field, and no QR code or number', async () => {
    renderDialog()
    const dialog = await screen.findByRole('dialog', { name: 'Support our parish' })
    expect(dialog).toHaveTextContent('Set an amount to give.')
    for (const label of ['₱100', '₱200', '₱500', '₱1,000']) expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    expect(screen.getByLabelText('Other amount')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/\b09\d{9}\b/)
    await expectNoA11yViolations(dialog)
  })

  it('asks for an amount before going on, and refuses one below the smallest gift', async () => {
    renderDialog()
    await userEvent.click(await screen.findByRole('button', { name: 'Continue' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter how much you would like to give.')

    await userEvent.type(screen.getByLabelText('Other amount'), '5')
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('The smallest gift is ₱20.')
  })

  it.each(['1e3', '0x10', '5.555', '12abc'])('does not take %s as an amount', async (typed) => {
    renderDialog()
    await userEvent.type(await screen.findByLabelText('Other amount'), typed)
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('like 250 or 250.50')
  })

  it('shows a summary of the chosen amount, then sends it to GCash in whole centavos', async () => {
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign })
    const create = vi.spyOn(donations, 'createDonation').mockResolvedValue({ checkoutUrl: 'https://checkout.paymongo.com/cs_1' })
    renderDialog()

    await userEvent.click(await screen.findByRole('button', { name: '₱500' }))
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByText('₱500.00')).toBeInTheDocument()
    expect(screen.getByText(/pay with GCash through PayMongo/i)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Give ₱500.00 with GCash' }))
    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith('https://checkout.paymongo.com/cs_1'))
    expect(create).toHaveBeenCalledWith(50000)
    vi.unstubAllGlobals()
  })

  it('with QR Ph, opens the scan page and keeps the code for it', async () => {
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign })
    vi.spyOn(donations, 'createDonation').mockResolvedValue({ donationId: 'd-1', qrImage: 'data:image/png;base64,AAAA', amountCentavos: 50000, reference: 'DON-1' })
    renderDialog()

    await userEvent.click(await screen.findByRole('button', { name: '₱500' }))
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await userEvent.click(screen.getByRole('button', { name: 'Give ₱500.00 with GCash' }))

    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith('/donate/qr?donationId=d-1'))
    expect(JSON.parse(sessionStorage.getItem('donation-qr:d-1')!)).toMatchObject({ qrImage: 'data:image/png;base64,AAAA', amountCentavos: 50000 })
    sessionStorage.clear()
    vi.unstubAllGlobals()
  })

  it('takes an amount typed in the Other field, and Change amount goes back to it', async () => {
    vi.spyOn(donations, 'createDonation').mockResolvedValue({ checkoutUrl: '/x' })
    renderDialog()
    await userEvent.type(await screen.findByLabelText('Other amount'), '1,250.50')
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByText('₱1,250.50')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Change amount' }))
    expect(await screen.findByLabelText('Other amount')).toHaveValue('1,250.50')
  })

  it('says what went wrong when the payment cannot be started, and stays on the summary', async () => {
    vi.spyOn(donations, 'createDonation').mockRejectedValue(new Error("We couldn't start your GCash payment. Please try again in a moment."))
    renderDialog()
    await userEvent.click(await screen.findByRole('button', { name: '₱100' }))
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await userEvent.click(await screen.findByRole('button', { name: /Give ₱100.00 with GCash/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't start your GCash payment")
    expect(screen.getByRole('button', { name: /Give ₱100.00 with GCash/ })).toBeEnabled()
  })

  it('calls onClose from Cancel and from Escape', async () => {
    const onClose = renderDialog()
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
