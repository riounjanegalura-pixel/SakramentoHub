import { beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CertificateRequestDetailScreen } from './CertificateRequestDetailScreen'
import * as data from '../../lib/data/certificateRequests'
import * as registerData from '../../lib/data/register'
import * as settingsData from '../../lib/data/settings'
import * as notificationsData from '../../lib/data/notifications'
import * as client from '../../lib/api/client'
import { LocationProbe, renderWithProviders } from '../../test/render'
import { certificateRequest, paginated, registerEntry } from '../../test/factories'
import type { AdminSettings } from '../../lib/types'

const match = registerEntry({ id: 'r9', registerNumber: 'BAP-1998-0012', subjectName: 'Pedro Santos', ceremonyDate: '1998-05-02', source: 'transcribed' })

function renderScreen(id = 'c1') {
  return renderWithProviders(<><CertificateRequestDetailScreen /><LocationProbe /></>, {
    route: `/certificate-requests/${id}`,
    path: '/certificate-requests/:id',
  })
}

describe('CertificateRequestDetailScreen', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:file'), revokeObjectURL: vi.fn() })
    vi.spyOn(notificationsData, 'fetchNotifications').mockResolvedValue([])
    vi.spyOn(client, 'apiFetchBlob').mockResolvedValue(new Blob(['x']))
    vi.spyOn(settingsData, 'fetchSettings').mockResolvedValue({ parish: { priestName: 'Rev. Fr. Leopoldo' } } as AdminSettings)
    vi.spyOn(data, 'fetchCertificateRequest').mockResolvedValue(certificateRequest())
    vi.spyOn(registerData, 'fetchRegister').mockResolvedValue(paginated([match]))
    vi.spyOn(window, 'confirm')
  })

  it('shows the request, the requester and the ID and letter links', async () => {
    vi.spyOn(data, 'fetchCertificateRequest').mockResolvedValue(
      certificateRequest({ relationship: 'representative', letterUrl: '/documents/u9/letter.pdf' }),
    )
    renderScreen()
    expect(await screen.findByText('CERT-20261005-AB12')).toBeInTheDocument()
    expect(screen.getByText('Baptism')).toBeInTheDocument()
    expect(screen.getByText('May 1998')).toBeInTheDocument()
    expect(screen.getByText('Jose Santos')).toBeInTheDocument()
    expect(screen.getByText('Maria Santos')).toBeInTheDocument()
    expect(screen.getByText('Passport application')).toBeInTheDocument()
    expect(screen.getByText('Representative')).toBeInTheDocument()
    expect(screen.getByText('pedro@example.com')).toBeInTheDocument()
    expect(screen.getByText('09171234567')).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'View ID' })).toHaveAttribute('href', 'blob:file')
    expect(await screen.findByRole('link', { name: 'View letter' })).toBeInTheDocument()
    expect(client.apiFetchBlob).toHaveBeenCalledWith('/documents/u9/id.jpg')
    expect(client.apiFetchBlob).toHaveBeenCalledWith('/documents/u9/letter.pdf')
    expect(screen.getByText(/compare the ID above with the name/i)).toBeInTheDocument()
  })

  it('has no letter link when there is no letter', async () => {
    renderScreen()
    await screen.findByRole('link', { name: 'View ID' })
    expect(screen.queryByRole('link', { name: 'View letter' })).not.toBeInTheDocument()
  })

  it('says the files were removed instead of linking them', async () => {
    vi.spyOn(data, 'fetchCertificateRequest').mockResolvedValue(
      certificateRequest({ status: 'issued', idUrl: null, letterUrl: null, filesRemovedAt: '2026-11-04T02:00:00.000000Z', closedAt: '2026-10-05T02:00:00.000000Z' }),
    )
    renderScreen()
    expect(await screen.findByText(/Files removed on Nov 4, 2026/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'View ID' })).not.toBeInTheDocument()
    expect(client.apiFetchBlob).not.toHaveBeenCalled()
  })

  it("searches the register for the request's own register, valid entries, prefilled with the name", async () => {
    const spy = vi.spyOn(registerData, 'fetchRegister').mockResolvedValue(paginated([match]))
    renderScreen()
    const box = await screen.findByLabelText('Search the register')
    expect(box).toHaveValue('Pedro Santos')
    await waitFor(() => expect(spy).toHaveBeenCalledWith(expect.objectContaining({ sacrament: 'baptism', status: 'valid', search: 'Pedro Santos' })))
    const row = within(await screen.findByRole('listitem', { name: 'BAP-1998-0012' }))
    expect(row.getByText('Pedro Santos')).toBeInTheDocument()
    expect(row.getByText(/May 2, 1998/)).toBeInTheDocument()
    expect(row.getByText(/Paper book/)).toBeInTheDocument()
  })

  it('lets staff edit the search', async () => {
    const spy = vi.spyOn(registerData, 'fetchRegister').mockResolvedValue(paginated([match]))
    renderScreen()
    const box = await screen.findByLabelText('Search the register')
    await userEvent.clear(box)
    await userEvent.type(box, 'Santos P')
    await waitFor(() => expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'Santos P', sacrament: 'baptism' })))
  })

  it('issues with the chosen entry after confirming, and refreshes the request', async () => {
    const issue = vi.spyOn(data, 'issueCertificateRequest').mockResolvedValue(
      certificateRequest({ status: 'issued', registerEntry: { id: 'r9', registerNumber: 'BAP-1998-0012' }, closedAt: '2026-10-06T02:00:00.000000Z' }),
    )
    const fetchOne = vi.spyOn(data, 'fetchCertificateRequest')
    renderScreen()
    await userEvent.click(await screen.findByRole('button', { name: 'Issue with this entry BAP-1998-0012' }))
    const dialog = within(await screen.findByRole('dialog', { name: /Issue this certificate/ }))
    expect(dialog.getByText('BAP-1998-0012')).toBeInTheDocument()
    expect(dialog.getByText(/will be told their certificate is ready/)).toBeInTheDocument()
    expect(window.confirm).not.toHaveBeenCalled()
    await userEvent.click(dialog.getByRole('button', { name: 'Issue certificate' }))
    await waitFor(() => expect(issue).toHaveBeenCalledWith('c1', 'r9'))
    await waitFor(() => expect(fetchOne.mock.calls.length).toBeGreaterThan(1))
  })

  it('does not issue when the dialog is cancelled', async () => {
    const issue = vi.spyOn(data, 'issueCertificateRequest')
    renderScreen()
    await userEvent.click(await screen.findByRole('button', { name: 'Issue with this entry BAP-1998-0012' }))
    await userEvent.click(within(await screen.findByRole('dialog', { name: /Issue this certificate/ })).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog', { name: /Issue this certificate/ })).not.toBeInTheDocument()
    expect(issue).not.toHaveBeenCalled()
  })

  it('shows an issued request with a link to the entry and no actions', async () => {
    vi.spyOn(data, 'fetchCertificateRequest').mockResolvedValue(
      certificateRequest({ status: 'issued', registerEntry: { id: 'r9', registerNumber: 'BAP-1998-0012' }, handledBy: { id: 'a1', fullName: 'Maria Staff' }, closedAt: '2026-10-06T02:00:00.000000Z' }),
    )
    renderScreen()
    expect(await screen.findByRole('link', { name: 'BAP-1998-0012' })).toHaveAttribute('href', '/register/r9')
    expect(screen.getByText('Maria Staff')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Issue with this entry/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Return / decline with remarks' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Search the register')).not.toBeInTheDocument()
    expect(registerData.fetchRegister).not.toHaveBeenCalled()
  })

  it('shows a declined request with its reason and no actions', async () => {
    vi.spyOn(data, 'fetchCertificateRequest').mockResolvedValue(certificateRequest({ status: 'declined', declineReason: 'No such record.', closedAt: '2026-10-06T02:00:00.000000Z' }))
    renderScreen()
    expect(await screen.findByText('No such record.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Return / decline with remarks' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add entry' })).not.toBeInTheDocument()
  })

  it('shows a cancelled request with no actions', async () => {
    vi.spyOn(data, 'fetchCertificateRequest').mockResolvedValue(certificateRequest({ status: 'cancelled', closedAt: '2026-10-06T02:00:00.000000Z' }))
    renderScreen()
    expect(await screen.findByText('Cancelled')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Return / decline with remarks' })).not.toBeInTheDocument()
  })

  it("shows the server's refusal message when issuing fails", async () => {
    vi.spyOn(data, 'issueCertificateRequest').mockRejectedValue(new client.ApiError('That entry is revoked.', 422, { message: 'That entry is revoked.' }))
    renderScreen()
    await userEvent.click(await screen.findByRole('button', { name: 'Issue with this entry BAP-1998-0012' }))
    await userEvent.click(within(await screen.findByRole('dialog', { name: /Issue this certificate/ })).getByRole('button', { name: 'Issue certificate' }))
    const dialog = screen.getByRole('dialog', { name: /Issue this certificate/ })
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('That entry is revoked.')
  })

  it('offers the paper-book form prefilled, then Issue for the new entry without issuing it', async () => {
    const created = registerEntry({ id: 'r77', registerNumber: 'BAP-1998-0099', subjectName: 'Pedro Santos', ceremonyDate: '1998-05-02', source: 'transcribed' })
    vi.spyOn(registerData, 'fetchRegister').mockResolvedValue(paginated([]))
    vi.spyOn(registerData, 'transcribeEntry').mockResolvedValue(created)
    const issue = vi.spyOn(data, 'issueCertificateRequest')
    renderScreen()
    await userEvent.click(await screen.findByRole('button', { name: 'Add entry' }))
    expect(screen.getByLabelText(/^Register/)).toHaveValue('baptism')
    expect(screen.getByLabelText(/^Name/)).toHaveValue('Pedro Santos')

    fireEvent.change(screen.getByLabelText(/^Ceremony date/), { target: { value: '1998-05-02' } })
    await userEvent.type(screen.getByLabelText(/^Book no/), '4')
    await userEvent.type(screen.getByLabelText(/^Page no/), '12')
    expect(screen.getByLabelText(/^Minister/)).toHaveValue('')
    await userEvent.click(await screen.findByRole('button', { name: 'Use Rev. Fr. Leopoldo' }))
    expect(screen.getByLabelText(/^Minister/)).toHaveValue('Rev. Fr. Leopoldo')
    await userEvent.click(screen.getByRole('button', { name: 'Save entry' }))

    expect(await screen.findByRole('button', { name: 'Issue with this entry BAP-1998-0099' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Ceremony date')).not.toBeInTheDocument()
    expect(issue).not.toHaveBeenCalled()
    expect(screen.getByTestId('location')).toHaveTextContent('/certificate-requests/c1')
  })

  describe('decline', () => {
    it('fills in the standard message when the ID is wrong or unclear, and sends it to the requester', async () => {
      const decline = vi.spyOn(data, 'declineCertificateRequest').mockResolvedValue(certificateRequest({ status: 'declined' }))
      renderScreen()
      await userEvent.click(await screen.findByRole('button', { name: 'Return / decline with remarks' }))
      await userEvent.click(screen.getByRole('button', { name: /Wrong or unclear ID/ }))
      expect(screen.getByLabelText(/^Remarks/)).toHaveDisplayValue(/re-upload a clear copy of a valid government-issued ID/)
      await userEvent.click(screen.getByRole('button', { name: 'Send back to the requester' }))
      await waitFor(() => expect(decline).toHaveBeenCalledWith('c1', expect.stringContaining('Invalid document uploaded.')))
    })

    it('needs a reason', async () => {
      const decline = vi.spyOn(data, 'declineCertificateRequest')
      renderScreen()
      await userEvent.click(await screen.findByRole('button', { name: 'Return / decline with remarks' }))
      await userEvent.click(screen.getByRole('button', { name: 'Send back to the requester' }))
      expect(await screen.findByText('Give a reason.')).toBeInTheDocument()
      expect(decline).not.toHaveBeenCalled()
    })

    it('sends the trimmed reason and refreshes', async () => {
      const decline = vi.spyOn(data, 'declineCertificateRequest').mockResolvedValue(certificateRequest({ status: 'declined', declineReason: 'No such record.' }))
      const fetchOne = vi.spyOn(data, 'fetchCertificateRequest')
      renderScreen()
      await userEvent.click(await screen.findByRole('button', { name: 'Return / decline with remarks' }))
      await userEvent.type(screen.getByLabelText(/^Remarks/), '  No such record. ')
      await userEvent.click(screen.getByRole('button', { name: 'Send back to the requester' }))
      await waitFor(() => expect(decline).toHaveBeenCalledWith('c1', 'No such record.'))
      await waitFor(() => expect(fetchOne.mock.calls.length).toBeGreaterThan(1))
    })

    it('shows the server message when declining is refused', async () => {
      vi.spyOn(data, 'declineCertificateRequest').mockRejectedValue(new client.ApiError('Only a request that is still waiting can be issued or declined.', 422, null))
      renderScreen()
      await userEvent.click(await screen.findByRole('button', { name: 'Return / decline with remarks' }))
      await userEvent.type(screen.getByLabelText(/^Remarks/), 'x')
      await userEvent.click(screen.getByRole('button', { name: 'Send back to the requester' }))
      expect(await screen.findByRole('alert')).toHaveTextContent('Only a request that is still waiting can be issued or declined.')
    })
  })

  it('shows the load error', async () => {
    vi.spyOn(data, 'fetchCertificateRequest').mockRejectedValue(new Error('Not found'))
    renderScreen()
    expect(await screen.findByText(/Couldn.t load this request: Not found/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('shows a loading state while the request loads', async () => {
    vi.spyOn(data, 'fetchCertificateRequest').mockReturnValue(new Promise(() => {}))
    renderScreen()
    expect(await screen.findByRole('status', { name: 'Loading the request' })).toBeInTheDocument()
  })

  it('says nothing matches when the register search is empty', async () => {
    vi.spyOn(registerData, 'fetchRegister').mockResolvedValue(paginated([]))
    renderScreen()
    expect(await screen.findByText(/No valid Baptism entries match/)).toBeInTheDocument()
  })

  it('shows a register search error with a way to retry', async () => {
    vi.spyOn(registerData, 'fetchRegister').mockRejectedValue(new Error('Offline'))
    renderScreen()
    expect(await screen.findByText(/Couldn.t search the register: Offline/)).toBeInTheDocument()
  })

  it('closes the decline dialog without sending when kept', async () => {
    const decline = vi.spyOn(data, 'declineCertificateRequest')
    renderScreen()
    await userEvent.click(await screen.findByRole('button', { name: 'Return / decline with remarks' }))
    const dialog = await screen.findByRole('dialog', { name: 'Return or decline this request' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep request' }))
    expect(screen.queryByRole('dialog', { name: 'Return or decline this request' })).not.toBeInTheDocument()
    expect(decline).not.toHaveBeenCalled()
  })
})
