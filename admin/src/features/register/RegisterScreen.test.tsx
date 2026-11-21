import { beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RegisterScreen } from './RegisterScreen'
import * as registerData from '../../lib/data/register'
import * as settingsData from '../../lib/data/settings'
import * as notificationsData from '../../lib/data/notifications'
import { LocationProbe, renderWithProviders } from '../../test/render'
import { paginated, registerEntry } from '../../test/factories'
import { expectNoA11yViolations } from '../../test/a11y'

const rows = [
  registerEntry(),
  registerEntry({ id: 'r2', registerNumber: 'BAP-1998-0001', year: 1998, subjectName: 'Pedro Santos', ceremonyDate: '1998-05-02', source: 'transcribed', status: 'revoked' }),
]

function renderScreen(route = '/register') {
  return renderWithProviders(
    <>
      <RegisterScreen />
      <LocationProbe />
    </>,
    { route },
  )
}

/** A row is one link, named by its register number. */
async function findRow(registerNumber: string): Promise<HTMLElement> {
  return await screen.findByRole('link', { name: registerNumber }, { timeout: 5000 })
}

describe('RegisterScreen', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(notificationsData, 'fetchNotifications').mockResolvedValue([])
    vi.spyOn(registerData, 'fetchRegister').mockResolvedValue(paginated(rows))
  })

  it('lists entries with number, name, register, ceremony date, source and status', async () => {
    renderScreen()
    const row1 = within(await findRow('BAP-2026-0007'))
    expect(row1.getByText('Juana Dela Cruz')).toBeInTheDocument()
    expect(row1.getByText(/Baptism · From a booking/)).toBeInTheDocument()
    expect(row1.getByText(/Mar 14, 2026/)).toBeInTheDocument()
    expect(row1.getByText('Valid')).toBeInTheDocument()
    const row2 = within(await findRow('BAP-1998-0001'))
    expect(row2.getByText(/Paper book/)).toBeInTheDocument()
    expect(row2.getByText('Revoked')).toBeInTheDocument()
  })

  it('opens an entry when its row is clicked', async () => {
    renderScreen()
    await userEvent.click(await findRow('BAP-1998-0001'))
    expect(screen.getByTestId('location')).toHaveTextContent('/register/r2')
  })

  it('opens an entry with Enter on its register number, and no row is a bare focus stop', async () => {
    renderScreen()
    const link = await screen.findByRole('link', { name: 'BAP-1998-0001' })
    link.focus()
    await userEvent.keyboard('{Enter}')
    expect(screen.getByTestId('location')).toHaveTextContent('/register/r2')
  })

  it('has no accessibility violations', async () => {
    const { container } = renderScreen()
    await findRow('BAP-1998-0001')
    expect(screen.getByRole('region', { name: 'Register entries' })).toBeInTheDocument()
    await expectNoA11yViolations(container)
  })

  it('sends the register, year, status and source filters to the server', async () => {
    const spy = vi.spyOn(registerData, 'fetchRegister').mockResolvedValue(paginated(rows))
    renderScreen()
    await screen.findByText('Juana Dela Cruz')

    await userEvent.selectOptions(screen.getByLabelText('Filter by register'), 'baptism')
    await userEvent.type(screen.getByLabelText('Filter by year'), '1998')
    await userEvent.selectOptions(screen.getByLabelText('Filter by status'), 'revoked')
    await userEvent.selectOptions(screen.getByLabelText('Filter by source'), 'transcribed')

    await waitFor(() =>
      expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ sacrament: 'baptism', year: '1998', status: 'revoked', source: 'transcribed', page: 1 })),
    )
  })

  it('reads filters from the address so a view can be linked, ignoring unknown values', async () => {
    const spy = vi.spyOn(registerData, 'fetchRegister').mockResolvedValue(paginated(rows))
    renderScreen('/register?status=revoked&sacrament=wedding&source=bogus')
    await screen.findByText('Juana Dela Cruz')
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'revoked', sacrament: 'wedding', source: '' }))
    expect(screen.getByLabelText('Filter by status')).toHaveValue('revoked')
  })

  it('sends the search text, debounced, and returns to page 1', async () => {
    const spy = vi.spyOn(registerData, 'fetchRegister').mockResolvedValue(paginated(rows))
    renderScreen()
    await screen.findByText('Juana Dela Cruz')
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search the register' }), { target: { value: 'BAP-1998' } })
    await waitFor(() => expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'BAP-1998', page: 1 })))
  })

  it('pages through the register', async () => {
    const spy = vi.spyOn(registerData, 'fetchRegister').mockResolvedValue({ ...paginated(rows), meta: { current_page: 1, last_page: 3, per_page: 10, total: 40 } })
    renderScreen()
    await userEvent.click(await screen.findByRole('button', { name: 'Next page' }))
    await waitFor(() => expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 })))
  })

  it('says so when nothing matches', async () => {
    vi.spyOn(registerData, 'fetchRegister').mockResolvedValue(paginated([]))
    renderScreen()
    expect(await screen.findByText(/No register entries match/)).toBeInTheDocument()
  })

  it('shows the server message when the register cannot be loaded', async () => {
    vi.spyOn(registerData, 'fetchRegister').mockRejectedValue(new Error('Server unavailable'))
    renderScreen()
    expect(await screen.findByText(/Server unavailable/)).toBeInTheDocument()
  })

  it('opens the paper-book form, and goes to the new entry once it is added', async () => {
    vi.spyOn(settingsData, 'fetchSettings').mockRejectedValue(new Error('offline'))
    vi.spyOn(registerData, 'transcribeEntry').mockResolvedValue(registerEntry({ id: 'r77', registerNumber: 'BAP-1998-0002' }))
    renderScreen()
    await userEvent.click(await screen.findByRole('button', { name: 'Add entry' }))
    const form = within(screen.getByRole('dialog', { name: 'Add entry from paper book' }))
    await userEvent.type(form.getByLabelText(/^Name/), 'Pedro Santos')
    fireEvent.change(form.getByLabelText(/^Ceremony date/), { target: { value: '1998-05-02' } })
    await userEvent.type(form.getByLabelText(/^Minister/), 'Fr. Old')
    await userEvent.type(form.getByLabelText(/^Book no/), '4')
    await userEvent.type(form.getByLabelText(/^Page no/), '12')
    await userEvent.click(form.getByRole('button', { name: 'Save entry' }))
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/register/r77'))
  })
})
