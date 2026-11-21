import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import '@testing-library/jest-dom'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { RequestCertificateScreen } from './RequestCertificateScreen'
import { ApiError } from '../../lib/api/client'
import { setViewport } from '../../test/viewport'
import { useAuthStore } from '../../stores/auth-store'
import type { CertificateRequest, RegisterEntrySummary } from '../../lib/types'

const create = vi.fn()
vi.mock('../../lib/data/certificateRequests', () => ({
  createCertificateRequest: (...a: unknown[]) => create(...a),
  fetchMyCertificateRequests: vi.fn().mockResolvedValue([]),
  cancelCertificateRequest: vi.fn(),
}))
const fetchEntries = vi.fn<() => Promise<RegisterEntrySummary[]>>()
vi.mock('../../lib/data/registerEntries', () => ({
  fetchMyRegisterEntries: () => fetchEntries(),
  fetchRegisterEntryCertificateHtml: vi.fn(),
}))
const upload = vi.fn()
vi.mock('../../lib/data/documents', () => ({ uploadDocument: (...a: unknown[]) => upload(...a), fetchDocumentFile: vi.fn() }))

const created = (over: Partial<CertificateRequest> = {}): CertificateRequest => ({
  id: 'c1', referenceNumber: 'CERT-20261006-AB12', sacrament: 'baptism', personName: 'Ana Reyes', sacramentDateText: 'March 1998',
  details: { fatherName: null, motherName: null, spouseName: null }, relationship: 'self', purpose: 'Passport', status: 'submitted',
  declineReason: null, registerEntry: null, createdAt: '2026-10-06T03:00:00Z', closedAt: null, ...over,
})

function Where() {
  const loc = useLocation()
  return <p data-testid="where">{loc.pathname}|{JSON.stringify(loc.state)}</p>
}

function renderScreen(lookup: 'number' | 'details' = 'details') {
  const view = render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/certificates/request']}>
        <Routes>
          <Route path="/certificates/request" element={<RequestCertificateScreen />} />
          <Route path="/wallet" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  if (lookup === 'details') fireEvent.click(screen.getByRole('radio', { name: /don't have it/i }))
  return view
}

const idPhoto = () => new File(['x'], 'id.jpg', { type: 'image/jpeg' })

async function fillBasics(user: ReturnType<typeof userEvent.setup>, record = 'baptism') {
  await user.selectOptions(screen.getByLabelText(/which record/i), record)
  await user.type(screen.getByLabelText(/name on the record/i), 'Ana Reyes')
  await user.type(screen.getByLabelText(/date or year/i), 'March 1998')
  await user.selectOptions(screen.getByLabelText(/relationship/i), 'self')
  await user.type(screen.getByLabelText(/what is the copy for/i), 'Passport')
}

describe('RequestCertificateScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchEntries.mockResolvedValue([])
    upload.mockResolvedValue({ url: '/documents/u1/id.jpg' })
    create.mockResolvedValue(created())
  })

  it('starts the name from the account when the request is for oneself, and leaves a typed name alone', async () => {
    useAuthStore.getState().setUser({ id: 'u1', fullName: 'Ana Reyes', email: 'a@x.com', phone: '', address: '' })
    const user = userEvent.setup()
    renderScreen()
    await user.selectOptions(screen.getByLabelText(/relationship/i), 'self')
    expect(screen.getByLabelText(/name on the record/i)).toHaveValue('Ana Reyes')
    await user.selectOptions(screen.getByLabelText(/relationship/i), 'parent')
    await user.clear(screen.getByLabelText(/name on the record/i))
    await user.type(screen.getByLabelText(/name on the record/i), 'Maria Reyes')
    await user.selectOptions(screen.getByLabelText(/relationship/i), 'self')
    expect(screen.getByLabelText(/name on the record/i)).toHaveValue('Maria Reyes')
    useAuthStore.setState({ user: null })
  })

  it('asks only for the register number when the person has it, and for the name and date when they do not', async () => {
    renderScreen('number')
    expect(screen.getByLabelText(/register number on your certificate/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/name on the record/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/date or year/i)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: /don't have it/i }))
    expect(screen.getByLabelText(/name on the record/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/register number on your certificate/i)).not.toBeInTheDocument()
  })

  it('offers the four records with the register labels, the hint, and the no-fee line', () => {
    renderScreen()
    for (const label of ['Baptismal certificate', 'Confirmation certificate', 'Marriage certificate', 'Death certificate']) {
      expect(screen.getByRole('option', { name: label })).toBeInTheDocument()
    }
    expect(screen.getByText(/e\.g\. March 1998 or 1998/i)).toBeInTheDocument()
    expect(screen.getByText('There is no fee through the app. Any stipend is settled at the parish office.')).toBeInTheDocument()
    expect(screen.getByText(/deleted 30 days after the request is closed/i)).toBeInTheDocument()
  })

  it('shows parents only for baptism and confirmation, spouse only for marriage', async () => {
    const user = userEvent.setup()
    renderScreen()
    const select = screen.getByLabelText(/which record/i)
    expect(screen.queryByLabelText(/father/i)).not.toBeInTheDocument()
    await user.selectOptions(select, 'baptism')
    expect(screen.getByLabelText(/father's name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/mother's name/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/spouse/i)).not.toBeInTheDocument()
    await user.selectOptions(select, 'confirmation')
    expect(screen.getByLabelText(/father's name/i)).toBeInTheDocument()
    await user.selectOptions(select, 'wedding')
    expect(screen.getByLabelText(/spouse's name/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/father/i)).not.toBeInTheDocument()
    await user.selectOptions(select, 'funeral')
    expect(screen.queryByLabelText(/spouse/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/mother/i)).not.toBeInTheDocument()
  })

  it('tags the parents name fields Optional and puts "if you know it" in a hint, not the label', async () => {
    const user = userEvent.setup()
    renderScreen()
    await user.selectOptions(screen.getByLabelText(/which record/i), 'baptism')
    const father = screen.getByLabelText(/father's name/i)
    expect(father).not.toBeRequired()
    const label = document.querySelector('label[for="cert-father"]')!
    expect(label).toHaveTextContent("Father's nameOptional")
    expect(label).not.toHaveTextContent(/if you know it/i)
    expect(document.getElementById(father.getAttribute('aria-describedby')!)).toHaveTextContent('If you know it')
  })

  it('needs the ID photo, and does not submit without it', async () => {
    const user = userEvent.setup()
    renderScreen()
    await fillBasics(user)
    await user.click(screen.getByRole('button', { name: /send request/i }))
    expect(await screen.findByText(/add a photo of your valid id/i)).toBeInTheDocument()
    expect(create).not.toHaveBeenCalled()
  })

  it('shows and requires the letter only for an authorised representative', async () => {
    const user = userEvent.setup()
    renderScreen()
    expect(screen.queryByLabelText(/authorisation letter/i)).not.toBeInTheDocument()
    await fillBasics(user)
    await user.upload(screen.getByLabelText(/photo of your valid id/i), idPhoto())
    await user.selectOptions(screen.getByLabelText(/relationship/i), 'representative')
    expect(screen.getByLabelText(/authorisation letter/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /send request/i }))
    expect(await screen.findByText(/add the authorisation letter/i)).toBeInTheDocument()
    expect(create).not.toHaveBeenCalled()
    upload.mockResolvedValueOnce({ url: '/documents/u1/letter.pdf' })
    await user.upload(screen.getByLabelText(/authorisation letter/i), new File(['x'], 'l.pdf', { type: 'application/pdf' }))
    await user.click(screen.getByRole('button', { name: /send request/i }))
    await waitFor(() => expect(create).toHaveBeenCalled())
    expect(create.mock.calls[0][0]).toMatchObject({ relationship: 'representative', letterUrl: '/documents/u1/letter.pdf' })
  })

  it('sends the exact payload (blank optional names left out) and goes to the wallet with the reference', async () => {
    const user = userEvent.setup()
    renderScreen()
    await fillBasics(user)
    await user.type(screen.getByLabelText(/father's name/i), 'Jose Reyes')
    await user.upload(screen.getByLabelText(/photo of your valid id/i), idPhoto())
    await user.click(screen.getByRole('button', { name: /send request/i }))
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
    expect(create.mock.calls[0][0]).toEqual({
      sacrament: 'baptism', personName: 'Ana Reyes', sacramentDateText: 'March 1998', details: { fatherName: 'Jose Reyes' },
      relationship: 'self', purpose: 'Passport', idUrl: '/documents/u1/id.jpg',
    })
    expect((await screen.findByTestId('where')).textContent).toContain('/wallet|')
    expect(screen.getByTestId('where').textContent).toContain('CERT-20261006-AB12')
  })

  it('does not send stale parents when the record was switched to marriage', async () => {
    const user = userEvent.setup()
    renderScreen()
    await fillBasics(user)
    await user.type(screen.getByLabelText(/father's name/i), 'Jose Reyes')
    await user.selectOptions(screen.getByLabelText(/which record/i), 'wedding')
    await user.type(screen.getByLabelText(/spouse's name/i), 'Ben Cruz')
    await user.upload(screen.getByLabelText(/photo of your valid id/i), idPhoto())
    await user.click(screen.getByRole('button', { name: /send request/i }))
    await waitFor(() => expect(create).toHaveBeenCalled())
    expect(create.mock.calls[0][0].details).toEqual({ spouseName: 'Ben Cruz' })
  })

  it('puts server field errors on the fields', async () => {
    create.mockRejectedValue(new ApiError('The given data was invalid.', 422, {
      sacramentDateText: ['The date is too long.'], 'details.fatherName': ['Too long.'], idUrl: ['That file is not yours.'],
    }))
    const user = userEvent.setup()
    renderScreen()
    await fillBasics(user)
    await user.upload(screen.getByLabelText(/photo of your valid id/i), idPhoto())
    await user.click(screen.getByRole('button', { name: /send request/i }))
    expect(await screen.findByText('The date is too long.')).toBeInTheDocument()
    expect(screen.getByText('Too long.')).toBeInTheDocument()
    expect(screen.getByText('That file is not yours.')).toBeInTheDocument()
  })

  it('shows a server refusal such as the open-request limit at the top', async () => {
    create.mockRejectedValue(new ApiError('You already have 5 open requests.', 422))
    const user = userEvent.setup()
    renderScreen()
    await fillBasics(user)
    await user.upload(screen.getByLabelText(/photo of your valid id/i), idPhoto())
    await user.click(screen.getByRole('button', { name: /send request/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('You already have 5 open requests.')
  })

  it('tells the person when they already hold that register, with a link to the wallet, without blocking', async () => {
    fetchEntries.mockResolvedValue([{
      id: 'e1', registerNumber: 'BAP-2026-0007', register: 'Baptism', subjectName: 'Ana', ceremonyDate: '2026-09-12',
      status: 'valid', verifyUrl: null, via: 'booking',
    }])
    const user = userEvent.setup()
    renderScreen()
    await user.selectOptions(screen.getByLabelText(/which record/i), 'confirmation')
    expect(screen.queryByText(/you already have a/i)).not.toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText(/which record/i), 'baptism')
    expect(await screen.findByText('You already have a Baptism certificate in your wallet.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /wallet/i })).toHaveAttribute('href', '/wallet')
    expect(screen.getByRole('button', { name: /send request/i })).toBeEnabled()
  })

  describe('Your requests aside', () => {
    const originalMatchMedia = window.matchMedia
    afterEach(() => { window.matchMedia = originalMatchMedia })

    it('on a desktop holds My requests beside the form', async () => {
      setViewport(1280)
      renderScreen()
      const aside = screen.getByRole('complementary', { name: 'Your requests' })
      expect(await within(aside).findByText('My requests')).toBeInTheDocument()
    })

    it('on a phone has no such aside', async () => {
      setViewport(390)
      renderScreen()
      expect(screen.getByRole('button', { name: 'Send request' })).toBeInTheDocument()
      expect(screen.queryByText('My requests')).not.toBeInTheDocument()
      expect(screen.queryByRole('complementary', { name: 'Your requests' })).not.toBeInTheDocument()
    })
  })
})
