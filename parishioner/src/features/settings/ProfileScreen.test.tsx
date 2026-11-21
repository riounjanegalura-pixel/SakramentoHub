import '@testing-library/jest-dom'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ProfileScreen, toProfilePayload } from './ProfileScreen'
import { useAuthStore } from '../../stores/auth-store'
import { expectNoA11yViolations } from '../../test/a11y'
import { expectTokenOnlySource } from '../../test/tokenSource'

const mockNavigate = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

function renderWithProviders() {
  const client = new QueryClient()
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ProfileScreen />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('ProfileScreen', () => {
  beforeEach(() => {
    mockNavigate.mockClear()
    useAuthStore.setState({
      user: { id: '1', fullName: 'Rio Galura', email: 'rio@example.com', phone: '09123456789', address: '', birthDate: '1990-05-01', sex: 'female', addressLine: '123 Rizal Street' },
    })
  })

  it('states required fields in words, not with an asterisk', () => {
    renderWithProviders()
    for (const name of ['Full name', 'Email address', 'Contact number', 'Date of birth', 'Sex']) {
      expect(screen.getByText(name).closest('label')).toHaveTextContent('Required')
    }
    expect(screen.queryByText('*')).not.toBeInTheDocument()
  })

  it('is editable straight away, with one Save changes button and no edit mode', () => {
    renderWithProviders()
    expect(screen.queryByLabelText('Edit profile')).not.toBeInTheDocument()
    expect(screen.getByDisplayValue('Rio Galura')).not.toBeDisabled()
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument()
  })

  it('has real section headings', () => {
    renderWithProviders()
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['Rio Galura', 'Personal details', 'Home address'])
  })

  it('uses the right autocomplete and input types', () => {
    renderWithProviders()
    expect(screen.getByLabelText(/full name/i)).toHaveAttribute('autocomplete', 'name')
    expect(screen.getByLabelText(/email address/i)).toHaveAttribute('autocomplete', 'email')
    expect(screen.getByLabelText(/email address/i)).toHaveAttribute('type', 'email')
    expect(screen.getByLabelText(/contact number/i)).toHaveAttribute('autocomplete', 'tel')
    expect(screen.getByLabelText(/contact number/i)).toHaveAttribute('inputmode', 'tel')
  })

  it('saves changes, updates the auth store and says "Profile saved."', async () => {
    renderWithProviders()
    fireEvent.change(screen.getByDisplayValue('Rio Galura'), { target: { value: 'Rio G. Galura' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => {
      expect(useAuthStore.getState().user?.fullName).toBe('Rio G. Galura')
    })
    expect(await screen.findByRole('status')).toHaveTextContent('Profile saved.')
  })

  it('links an error to its field, keeps what was typed and focuses the first invalid field', async () => {
    renderWithProviders()
    const name = screen.getByLabelText(/full name/i)
    fireEvent.change(name, { target: { value: '' } })
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'nope' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(name).toHaveAttribute('aria-invalid', 'true'))
    expect(name).toHaveFocus()
    const errorId = name.getAttribute('aria-describedby')!.split(' ').find((i) => i.endsWith('-error'))!
    expect(document.getElementById(errorId)).toBeInTheDocument()
    expect(screen.getByLabelText(/email address/i)).toHaveValue('nope')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('offers Discard changes only once something changed, and restores the saved values', async () => {
    renderWithProviders()
    expect(screen.queryByRole('button', { name: 'Discard changes' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByDisplayValue('Rio Galura'), { target: { value: 'Someone Else' } })
    fireEvent.click(await screen.findByRole('button', { name: 'Discard changes' }))
    await waitFor(() => expect(screen.getByLabelText(/full name/i)).toHaveValue('Rio Galura'))
  })

  it('uses design tokens only', () => {
    expectTokenOnlySource(import.meta.dirname, 'ProfileScreen.tsx')
  })

  it('has no accessibility violations, idle or with errors', async () => {
    const { container } = renderWithProviders()
    await expectNoA11yViolations(container)
    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(screen.getByLabelText(/full name/i)).toHaveAttribute('aria-invalid', 'true'))
    await expectNoA11yViolations(container)
  })

  it('navigates back when the header back button is pressed', () => {
    renderWithProviders()
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }))
    expect(mockNavigate).toHaveBeenCalledWith(-1)
  })

  it('keeps the bottom tab bar visible so the user can jump to another section', () => {
    renderWithProviders()
    expect(screen.getByRole('navigation')).toBeInTheDocument()
  })

  it('populates fields once the user arrives after mount (e.g. async session rehydration on a hard reload)', async () => {
    useAuthStore.setState({ user: null })
    renderWithProviders()

    useAuthStore.setState({
      user: { id: '1', fullName: 'Rio Galura', email: 'rio@example.com', phone: '09123456789', address: '', birthDate: '1990-05-01', sex: 'female', addressLine: '123 Rizal Street' },
    })

    await waitFor(() => {
      expect(screen.getByDisplayValue('Rio Galura')).toBeInTheDocument()
    })
    expect(screen.getByDisplayValue('rio@example.com')).toBeInTheDocument()
    expect(screen.getByDisplayValue('09123456789')).toBeInTheDocument()
    expect(screen.getByDisplayValue('123 Rizal Street')).toBeInTheDocument()
  })

  it('edits civil status and saves the structured address', async () => {
    localStorage.clear()
    renderWithProviders()
    fireEvent.change(screen.getByLabelText(/civil status/i), { target: { value: 'married' } })
    fireEvent.change(screen.getByLabelText(/house no/i), { target: { value: '45 Mabini St.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem('sakramentohub_mock_current_user')!)
      expect(saved.civilStatus).toBe('married')
      expect(saved.addressLine).toBe('45 Mabini St.')
      expect(saved.birthDate).toBe('1990-05-01')
    })
  })

  it('does not send a civilStatus key when it was left unset', async () => {
    localStorage.clear()
    renderWithProviders()
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(localStorage.getItem('sakramentohub_mock_current_user')).not.toBeNull())
    expect(JSON.parse(localStorage.getItem('sakramentohub_mock_current_user')!)).not.toHaveProperty('civilStatus')
  })

  it('prefills the street line from the legacy free-text address', () => {
    useAuthStore.setState({
      user: { id: '1', fullName: 'Rio Galura', email: 'rio@example.com', phone: '09123456789', address: '9 Old Road', birthDate: '1990-05-01', sex: 'female' },
    })
    renderWithProviders()
    expect(screen.getByDisplayValue('9 Old Road')).toBeInTheDocument()
  })

  it('round-trips a saved structured address and sends its full shape', async () => {
    localStorage.clear()
    const addressPsgc = { display: 'Borol 1st, Balagtas, Bulacan', regionCode: '030000000', provinceCode: '031400000', cityCode: '031402000', barangayCode: '031402001' }
    useAuthStore.setState({
      user: { id: '1', fullName: 'Rio Galura', email: 'rio@example.com', phone: '09123456789', address: '', birthDate: '1990-05-01', sex: 'female', addressPsgc },
    })
    renderWithProviders()
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(localStorage.getItem('sakramentohub_mock_current_user')).not.toBeNull())
    expect(JSON.parse(localStorage.getItem('sakramentohub_mock_current_user')!).addressPsgc).toEqual(addressPsgc)
  })
})

describe('toProfilePayload', () => {
  const base = { fullName: 'Rio Galura', email: 'rio@example.com', phone: '09123456789', birthDate: '1990-05-01', sex: 'female' as const }

  it('sends the address as null when the picker is cleared', () => {
    expect(toProfilePayload({ ...base, addressPsgc: '' }).addressPsgc).toBeNull()
  })

  it('builds the addressPsgc object from the display and four codes', () => {
    const payload = toProfilePayload({ ...base, addressPsgc: 'Balagtas, Bulacan', addressPsgcRegionCode: '03', addressPsgcProvinceCode: '0314', addressPsgcCityCode: '031402', addressPsgcBarangayCode: '' })
    expect(payload.addressPsgc).toEqual({ display: 'Balagtas, Bulacan', regionCode: '03', provinceCode: '0314', cityCode: '031402', barangayCode: '' })
  })

  it('omits civilStatus when unset and includes it when chosen', () => {
    expect(toProfilePayload(base)).not.toHaveProperty('civilStatus')
    expect(toProfilePayload({ ...base, civilStatus: 'married' }).civilStatus).toBe('married')
  })
})
