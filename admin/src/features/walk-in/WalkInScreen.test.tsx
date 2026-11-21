import '@testing-library/jest-dom'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as api from '../../lib/api/walkIns'
import * as docs from '../../lib/api/documents'
import { renderWithProviders, LocationProbe } from '../../test/render'
import { WalkInScreen } from './WalkInScreen'

const FUNERAL = {
  fields: [
    { key: 'deceasedFirstName', label: 'Deceased first name', type: 'text', required: true },
    { key: 'massType', label: 'Mass type', type: 'select', options: ['church', 'house'], required: true },
  ],
  sponsors: null,
  documents: [{ key: 'deathCertificate', label: 'Death certificate', requirement: 'required', condition: null }],
} as const

function setup() {
  vi.spyOn(api, 'fetchWalkInSchema').mockResolvedValue(FUNERAL as never)
  vi.spyOn(api, 'fetchFreeStarts').mockResolvedValue(['10:00'])
  return renderWithProviders(
    <>
      <WalkInScreen />
      <LocationProbe />
    </>,
    { route: '/walk-in' },
  )
}

/** Fills everything the form asks for, so Submit is open. */
async function fillAll() {
  vi.spyOn(docs, 'uploadDocument').mockResolvedValue({ url: 'u/death.pdf' })
  fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Maria Santos' } })
  fireEvent.change(screen.getByLabelText(/Mobile number/), { target: { value: '09171234567' } })
  fireEvent.change(screen.getByLabelText(/They are the sacrament/), { target: { value: 'child' } })
  fireEvent.change(screen.getByLabelText('Sacrament'), { target: { value: 'funeral' } })
  fireEvent.change(await screen.findByLabelText(/Deceased first name/), { target: { value: 'Lorenzo' } })
  fireEvent.change(screen.getByLabelText(/Mass type/), { target: { value: 'church' } })
  fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2999-01-05' } })
  await screen.findByRole('option', { name: /10:00/ })
  fireEvent.change(screen.getByLabelText('Time'), { target: { value: '10:00' } })
  fireEvent.change(screen.getByLabelText(/Death certificate/), { target: { files: [new File(['x'], 'd.pdf', { type: 'application/pdf' })] } })
  await screen.findByText('Uploaded.')
}

describe('WalkInScreen', () => {
  afterEach(() => vi.restoreAllMocks())

  it('builds the form from what the server says the sacrament asks for', async () => {
    setup()
    fireEvent.change(screen.getByLabelText('Sacrament'), { target: { value: 'funeral' } })
    expect(await screen.findByLabelText(/Deceased first name/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Mass type/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Death certificate/)).toBeInTheDocument()
  })

  it('saves the walk-in with the contact, then submits it and opens the booking to take payment', async () => {
    const create = vi.spyOn(api, 'createWalkIn').mockResolvedValue({ id: 'b1' } as never)
    const submit = vi.spyOn(api, 'submitWalkIn').mockResolvedValue({ id: 'b1' } as never)
    setup()
    await fillAll()

    fireEvent.click(screen.getByRole('button', { name: 'Submit booking' }))

    await waitFor(() => expect(submit).toHaveBeenCalledWith('b1', { waiveLeadTime: false, waiveReason: '' }))
    const [sacrament, body] = create.mock.calls[0]
    expect(sacrament).toBe('funeral')
    expect(body.contact).toMatchObject({ fullName: 'Maria Santos', phone: '09171234567', relationship: 'child' })
    expect(body.formData).toMatchObject({ deceasedFirstName: 'Lorenzo', massType: 'church', bookingFor: 'other', relationship: 'child', alternatePhone: '09171234567' })
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/bookings/b1'))
  })

  it('shows the server\'s refusal on the field and keeps what was typed', async () => {
    vi.spyOn(api, 'createWalkIn').mockResolvedValue({ id: 'b1' } as never)
    const { ApiError } = await import('../../lib/api/client')
    vi.spyOn(api, 'submitWalkIn').mockRejectedValue(new ApiError('The given data was invalid.', 422, { errors: { 'formData.deceasedFirstName': ['Enter the first name.'] } }))
    setup()
    await fillAll()
    fireEvent.change(screen.getByLabelText(/Deceased first name/), { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit booking' }))

    expect(await screen.findByText('Enter the first name.')).toBeInTheDocument()
    expect(screen.getByLabelText(/Deceased first name/)).toHaveValue('x')
  })

  it('lists what still blocks Submit in This booking and keeps the button closed', async () => {
    setup()
    const box = screen.getByRole('complementary', { name: 'This booking' })
    expect(box).toHaveTextContent('This booking')
    expect(box).toHaveTextContent('Full name of the person at the counter')
    expect(screen.getByRole('button', { name: 'Submit booking' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Sacrament'), { target: { value: 'funeral' } })
    await screen.findByLabelText(/Deceased first name/)
    expect(box).toHaveTextContent('Deceased first name')
    expect(box).toHaveTextContent('Death certificate')
    expect(box).toHaveTextContent('Date')
  })

  it('opens Submit and says nothing is missing once everything is filled in', async () => {
    setup()
    await fillAll()
    expect(screen.getByText('Nothing is missing. You can submit.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Submit booking' })).toBeEnabled()
  })

  it('asks for a reason when the lead time is waived', async () => {
    setup()
    await fillAll()
    fireEvent.click(screen.getByLabelText(/Waive the minimum lead time/))
    expect(screen.getByRole('complementary', { name: 'This booking' })).toHaveTextContent('Reason for waiving the lead time')
    expect(screen.getByRole('button', { name: 'Submit booking' })).toBeDisabled()
  })

  it('shows a retry when the form for the sacrament does not load', async () => {
    vi.spyOn(api, 'fetchWalkInSchema').mockRejectedValue(new Error('boom'))
    renderWithProviders(<WalkInScreen />, { route: '/walk-in' })
    fireEvent.change(screen.getByLabelText('Sacrament'), { target: { value: 'funeral' } })
    expect(await screen.findByText(/load the form for this sacrament/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('shows the empty state before a sacrament is chosen', () => {
    renderWithProviders(<WalkInScreen />, { route: '/walk-in' })
    expect(screen.getByText(/Choose a sacrament/)).toBeInTheDocument()
  })
})
