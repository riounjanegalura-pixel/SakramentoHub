import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { VerifyScreen } from './VerifyScreen'
import { ApiError } from '../../lib/api/client'
import { useAuthStore } from '../../stores/auth-store'
import { setViewport } from '../../test/viewport'
import { expectNoA11yViolations } from '../../test/a11y'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const originalMatchMedia = window.matchMedia

const verifyCertificate = vi.fn()
vi.mock('../../lib/data/verify', () => ({
  verifyCertificate: (...a: unknown[]) => verifyCertificate(...a),
}))

const valid = {
  status: 'valid', parishName: 'St. Peter the Apostle Parish', sacrament: 'Baptism', registerNumber: 'BAP-2026-0007',
  subjectName: 'Maria Santos', ceremonyDate: '2026-10-05', minister: 'Fr. Jose Cruz', correctedOn: null,
}

function renderAt(path: string) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/verify" element={<VerifyScreen />} />
          <Route path="/verify/:number/:code" element={<VerifyScreen />} />
          <Route path="/login" element={<p>Login page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('VerifyScreen (public)', () => {
  beforeEach(() => {
    verifyCertificate.mockReset()
    useAuthStore.setState({ user: null, isBootstrapping: false })
  })

  it('renders signed out without redirecting to login', () => {
    renderAt('/verify')
    expect(screen.getByRole('button', { name: /check certificate/i })).toBeInTheDocument()
    expect(screen.queryByText('Login page')).not.toBeInTheDocument()
  })

  it('verifies on load when the URL carries the number and code', async () => {
    verifyCertificate.mockResolvedValue(valid)
    renderAt('/verify/BAP-2026-0007/ABCD-EFGH-JKMN')
    expect(await screen.findByText('Maria Santos')).toBeInTheDocument()
    expect(verifyCertificate).toHaveBeenCalledWith('BAP-2026-0007', 'ABCD-EFGH-JKMN')
  })

  it('submits what was typed in the form', async () => {
    verifyCertificate.mockResolvedValue(valid)
    renderAt('/verify')
    await userEvent.type(screen.getByLabelText(/register number/i), 'bap-2026-0007')
    await userEvent.type(screen.getByLabelText(/verification code/i), 'abcd-efgh-jkmn')
    await userEvent.click(screen.getByRole('button', { name: /check certificate/i }))
    expect(await screen.findByText('Maria Santos')).toBeInTheDocument()
    expect(verifyCertificate).toHaveBeenCalledWith('bap-2026-0007', 'abcd-efgh-jkmn')
  })

  it('shows the valid details with a long-form date and no correction line', async () => {
    verifyCertificate.mockResolvedValue(valid)
    renderAt('/verify/BAP-2026-0007/ABCD-EFGH-JKMN')
    expect(await screen.findByText(/valid certificate/i)).toBeInTheDocument()
    for (const t of ['St. Peter the Apostle Parish', 'Baptism', 'BAP-2026-0007', 'October 5, 2026', 'Fr. Jose Cruz']) {
      expect(screen.getByText(t)).toBeInTheDocument()
    }
    expect(screen.queryByText(/record corrected on/i)).not.toBeInTheDocument()
  })

  it('shows when the record was corrected', async () => {
    verifyCertificate.mockResolvedValue({ ...valid, correctedOn: '2026-10-07' })
    renderAt('/verify/BAP-2026-0007/ABCD-EFGH-JKMN')
    expect(await screen.findByText(/record corrected on october 7, 2026/i)).toBeInTheDocument()
  })

  it('says a revoked certificate was withdrawn', async () => {
    verifyCertificate.mockResolvedValue({ ...valid, status: 'revoked' })
    renderAt('/verify/BAP-2026-0007/ABCD-EFGH-JKMN')
    expect(await screen.findByText('This certificate was withdrawn by the parish office.')).toBeInTheDocument()
  })

  it('says what is missing when Check is pressed with an empty field, without calling the server', async () => {
    verifyCertificate.mockResolvedValue(valid)
    renderAt('/verify')
    await userEvent.click(screen.getByRole('button', { name: /check certificate/i }))
    expect(screen.getByRole('alert')).toHaveTextContent('Enter the register number and the verification code.')
    expect(verifyCertificate).not.toHaveBeenCalled()

    await userEvent.type(screen.getByLabelText(/register number/i), 'BAP-2026-0007')
    await userEvent.click(screen.getByRole('button', { name: /check certificate/i }))
    expect(screen.getByRole('alert')).toHaveTextContent('Enter the register number and the verification code.')
    expect(verifyCertificate).not.toHaveBeenCalled()

    await userEvent.type(screen.getByLabelText(/verification code/i), 'ABCD-EFGH-JKMN')
    await userEvent.click(screen.getByRole('button', { name: /check certificate/i }))
    expect(await screen.findByText('Maria Santos')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows the server message and a hint when nothing is found', async () => {
    verifyCertificate.mockRejectedValue(new ApiError('No record found. Check the number and code on the certificate.', 404))
    renderAt('/verify/BAP-2026-0007/WRONG')
    expect(await screen.findByRole('heading', { name: /no record found/i })).toBeInTheDocument()
    expect(screen.getAllByText(/No record found/)).toHaveLength(1)
    expect(screen.getByText(/check the number and code printed on the certificate/i)).toBeInTheDocument()
  })

  it('asks the visitor to wait a minute after too many attempts', async () => {
    verifyCertificate.mockRejectedValue(new ApiError('Too Many Attempts.', 429))
    renderAt('/verify/BAP-2026-0007/ABCD-EFGH-JKMN')
    expect(await screen.findByText(/too many attempts/i)).toBeInTheDocument()
    expect(screen.getByText(/wait a minute/i)).toBeInTheDocument()
  })

  it('offers a retry when the check could not be made', async () => {
    verifyCertificate.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    verifyCertificate.mockResolvedValueOnce(valid)
    renderAt('/verify/BAP-2026-0007/ABCD-EFGH-JKMN')
    expect(await screen.findByText(/couldn.t check/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(await screen.findByText('Maria Santos')).toBeInTheDocument()
  })

  it('is plain: no motion library, no animation or transition classes in the source', () => {
    const source = readFileSync(join(import.meta.dirname, 'VerifyScreen.tsx'), 'utf8')
    expect(source).not.toMatch(/motion\/react|from '@\/lib\/motion'|lib\/motion|components\/ui\/button'/)
    expect(source).not.toMatch(/\b(animate|transition)-/)
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(source).not.toMatch(/brand-/)
  })

  it('shows the register number and the ceremony date in mono', async () => {
    verifyCertificate.mockResolvedValue(valid)
    renderAt('/verify/BAP-2026-0007/ABCD-EFGH-JKMN')
    const number = await screen.findByText('BAP-2026-0007')
    expect(number).toHaveClass('font-mono')
    expect(screen.getByText('October 5, 2026')).toHaveClass('font-mono')
  })

  it('shows the register number in mono on a withdrawn certificate too', async () => {
    verifyCertificate.mockResolvedValue({ ...valid, status: 'revoked' })
    renderAt('/verify/BAP-2026-0007/ABCD-EFGH-JKMN')
    await screen.findByText('This certificate was withdrawn by the parish office.')
    expect(screen.getByText('BAP-2026-0007')).toHaveClass('font-mono')
  })

  it('gives the form inputs the right keyboard hints and states Required', () => {
    renderAt('/verify')
    const number = screen.getByLabelText(/register number/i)
    expect(number).toHaveAttribute('autocapitalize', 'characters')
    expect(number).toHaveAttribute('autocomplete', 'off')
    expect(screen.getAllByText('Required')).toHaveLength(2)
    expect(screen.getByRole('button', { name: /check certificate/i })).toHaveClass('bg-navy', 'text-white')
  })

  it('links the missing-field error to the empty input and focuses it', async () => {
    renderAt('/verify')
    await userEvent.click(screen.getByRole('button', { name: /check certificate/i }))
    const number = screen.getByLabelText(/register number/i)
    expect(number).toHaveAttribute('aria-invalid', 'true')
    expect(number).toHaveFocus()
    expect(number.getAttribute('aria-describedby')).toBeTruthy()
  })

  it('has no accessibility violations: form, valid, withdrawn, not found and error results', async () => {
    const blank = renderAt('/verify')
    await expectNoA11yViolations(blank.container)
    blank.unmount()
    for (const [result, text] of [
      [valid, 'Maria Santos'],
      [{ ...valid, status: 'revoked' }, 'This certificate was withdrawn by the parish office.'],
    ] as const) {
      verifyCertificate.mockResolvedValue(result)
      const r = renderAt('/verify/BAP-2026-0007/ABCD-EFGH-JKMN')
      await screen.findByText(text)
      await expectNoA11yViolations(r.container)
      r.unmount()
    }
    verifyCertificate.mockRejectedValue(new ApiError('No record found.', 404))
    const nf = renderAt('/verify/BAP-2026-0007/WRONG')
    await screen.findByRole('heading', { name: /no record found/i })
    await expectNoA11yViolations(nf.container)
    nf.unmount()
    verifyCertificate.mockRejectedValue(new TypeError('Failed to fetch'))
    const er = renderAt('/verify/BAP-2026-0007/ABCD-EFGH-JKMN')
    await screen.findByText(/couldn.t check/i)
    await expectNoA11yViolations(er.container)
  })

  it('links to the app home', () => {
    renderAt('/verify')
    expect(screen.getByRole('link', { name: /^sakramentohub$/i })).toHaveAttribute('href', '/')
  })

  it('on a desktop puts a valid result inside the result card', async () => {
    setViewport(1280)
    verifyCertificate.mockResolvedValue(valid)
    try {
      renderAt('/verify/BAP-2026-0007/ABCD-EFGH-JKMN')
      const name = await screen.findByText('Maria Santos')
      const card = document.querySelector('[data-result-card]')
      expect(card).not.toBeNull()
      expect(card).toContainElement(name)
    } finally {
      window.matchMedia = originalMatchMedia
    }
  })
})
