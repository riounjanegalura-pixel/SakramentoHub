import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { describe, it, expect, afterEach, vi } from 'vitest'
import '@testing-library/jest-dom'
import { RegisterWizard } from './RegisterWizard'
import { expectNoA11yViolations } from '../../test/a11y'

function renderWithProviders() {
  const client = new QueryClient()
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <RegisterWizard />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

async function completeAllSteps() {
  fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'Rio Dela Cruz' } })
  pickBirthDate(1990, 5, 1)
  fireEvent.change(screen.getByLabelText(/^sex/i), { target: { value: 'male' } })
  fireEvent.click(screen.getByText('Continue'))

  await waitFor(() => {
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
  })
  fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'rio@example.com' } })
  fireEvent.change(screen.getByLabelText(/contact number/i), { target: { value: '09171234567' } })
  fireEvent.click(screen.getByText('Continue'))

  await waitFor(() => {
    expect(screen.getByLabelText(/^password/i)).toBeInTheDocument()
  })
  fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: 'password123' } })
  fireEvent.click(screen.getByRole('checkbox'))
}

/** The date of birth is three lists (month, day, year), not a calendar. */
function pickBirthDate(year: number, month: number, day: number) {
  fireEvent.change(screen.getByLabelText('Month'), { target: { value: String(month) } })
  fireEvent.change(screen.getByLabelText('Day'), { target: { value: String(day) } })
  fireEvent.change(screen.getByLabelText('Year'), { target: { value: String(year) } })
}

describe('RegisterWizard', () => {
  it('blocks advancing past step 1 with an invalid full name', async () => {
    renderWithProviders()
    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'R' } })
    fireEvent.click(screen.getByText('Continue'))
    await waitFor(() => {
      expect(screen.getByText('Enter your full name')).toBeInTheDocument()
    })
    expect(screen.queryByLabelText(/contact number/i)).not.toBeInTheDocument()
  })

  // Regression test: previously there was no consent capture anywhere in the
  // app — registration could complete with zero record of consent, leaving
  // NFR:001's Data Privacy Act claim entirely unsupported.
  it('blocks account creation until the Privacy Notice checkbox is checked', async () => {
    renderWithProviders()
    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'Rio Dela Cruz' } })
    pickBirthDate(1990, 5, 1)
    fireEvent.change(screen.getByLabelText(/^sex/i), { target: { value: 'male' } })
    fireEvent.click(screen.getByText('Continue'))
    await waitFor(() => expect(screen.getByLabelText(/email/i)).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'rio@example.com' } })
    fireEvent.change(screen.getByLabelText(/contact number/i), { target: { value: '09171234567' } })
    fireEvent.click(screen.getByText('Continue'))
    await waitFor(() => expect(screen.getByLabelText(/^password/i)).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: 'password123' } })

    // Consent checkbox deliberately left unchecked.
    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }))

    await waitFor(() => {
      expect(screen.getByText('You must agree to the Privacy Notice to create an account.')).toBeInTheDocument()
    })
  })

  it('shows the Privacy Notice in a panel, keeps what was typed, and ticks the consent on "I agree"', async () => {
    renderWithProviders()
    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'Rio Dela Cruz' } })
    pickBirthDate(1990, 5, 1)
    fireEvent.change(screen.getByLabelText(/^sex/i), { target: { value: 'male' } })
    fireEvent.click(screen.getByText('Continue'))
    await waitFor(() => expect(screen.getByLabelText(/email/i)).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'rio@example.com' } })
    fireEvent.change(screen.getByLabelText(/contact number/i), { target: { value: '09171234567' } })
    fireEvent.click(screen.getByText('Continue'))
    await waitFor(() => expect(screen.getByLabelText(/^password/i)).toBeInTheDocument())

    // Not a link to another page: leaving the form would throw away everything typed so far.
    expect(screen.queryByRole('link', { name: 'Privacy Notice' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Privacy Notice' }))
    expect(await screen.findByText('What we collect')).toBeInTheDocument()
    expect(screen.getByLabelText(/^password/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'I agree' }))
    await waitFor(() => expect(screen.getByRole('checkbox')).toBeChecked())
  })

  describe('with VITE_MOCK_FAILURE_RATE forced to 1', () => {
    afterEach(() => {
      vi.unstubAllEnvs()
    })

    it('shows an error message when the mock register rejects', async () => {
      vi.stubEnv('VITE_MOCK_FAILURE_RATE', '1')
      renderWithProviders()
      await completeAllSteps()
      fireEvent.click(screen.getByRole('button', { name: 'Create Account' }))
      await waitFor(() => {
        expect(screen.getByText('Failed to register')).toBeInTheDocument()
      })
    })
  })

  async function completeStepOne() {
    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'Rio Dela Cruz' } })
    pickBirthDate(1990, 5, 1)
    fireEvent.change(screen.getByLabelText(/^sex/i), { target: { value: 'male' } })
    fireEvent.click(screen.getByText('Continue'))
    await screen.findByLabelText(/contact number/i)
  }

  it('uses the right input types and autocomplete values on each step', async () => {
    renderWithProviders()
    expect(screen.getByLabelText(/full name/i)).toHaveAttribute('autocomplete', 'name')
    expect(screen.getByLabelText('Month')).toBeInTheDocument()
    await completeStepOne()
    const phone = screen.getByLabelText(/contact number/i)
    expect(phone).toHaveAttribute('type', 'tel')
    expect(phone).toHaveAttribute('autocomplete', 'tel')
    expect(phone).toHaveAttribute('inputmode', 'tel')
    const email = screen.getByLabelText(/email/i)
    expect(email).toHaveAttribute('type', 'email')
    expect(email).toHaveAttribute('autocomplete', 'email')
    fireEvent.change(email, { target: { value: 'rio@example.com' } })
    fireEvent.change(phone, { target: { value: '09171234567' } })
    fireEvent.click(screen.getByText('Continue'))
    const password = await screen.findByLabelText(/^password/i)
    expect(password).toHaveAttribute('autocomplete', 'new-password')
  })

  it('focuses the first invalid field and links its error', async () => {
    renderWithProviders()
    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'R' } })
    fireEvent.click(screen.getByText('Continue'))
    const message = await screen.findByText('Enter your full name')
    const name = screen.getByLabelText(/full name/i)
    expect(name).toHaveAttribute('aria-invalid', 'true')
    expect(name.getAttribute('aria-describedby')).toContain(message.id)
    await waitFor(() => expect(name).toHaveFocus())
    expect(name).toHaveValue('R')
  })

  it('names the step the person is on and has no accessibility violations on any step', async () => {
    const { container } = renderWithProviders()
    expect(screen.getByText(/step 1 of 3/i)).toBeInTheDocument()
    await expectNoA11yViolations(container)
    await completeStepOne()
    expect(screen.getByText(/step 2 of 3/i)).toBeInTheDocument()
    await expectNoA11yViolations(container)
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'rio@example.com' } })
    fireEvent.change(screen.getByLabelText(/contact number/i), { target: { value: '09171234567' } })
    fireEvent.click(screen.getByText('Continue'))
    await screen.findByLabelText(/^password/i)
    expect(screen.getByRole('button', { name: 'Create Account' })).toHaveClass('bg-navy', 'text-white')
    await expectNoA11yViolations(container)
    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }))
    await screen.findByText('You must agree to the Privacy Notice to create an account.')
    await expectNoA11yViolations(container)
  })

  it('asks for birth date and sex on the first step', async () => {
    renderWithProviders()
    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'Maria Clara Santos' } })
    fireEvent.click(screen.getByText('Continue'))
    expect(await screen.findByText('Enter your date of birth')).toBeInTheDocument()
    expect(screen.getByText('Select your sex')).toBeInTheDocument()
  })
})
