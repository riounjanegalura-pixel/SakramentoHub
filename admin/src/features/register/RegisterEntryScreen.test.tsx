import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RegisterEntryScreen } from './RegisterEntryScreen'
import * as registerData from '../../lib/data/register'
import * as notificationsData from '../../lib/data/notifications'
import { useAuthStore } from '../../stores/auth-store'
import { renderWithProviders } from '../../test/render'
import { registerEntry, registerEntryDetail } from '../../test/factories'
import type { AuditLogEntry, Role } from '../../lib/types'

const signIn = (role: Role) =>
  useAuthStore.setState({ user: { id: 'u1', fullName: 'Someone', email: 's@example.com', phone: '', address: '', role, isActive: true } })

const revoked = () => registerEntryDetail({ status: 'revoked', revokedReason: 'Entered for the wrong person', revokedAt: '2026-04-01T02:00:00Z' })

function renderScreen() {
  return renderWithProviders(<RegisterEntryScreen />, { route: '/register/r1', path: '/register/:id' })
}

const audit = (action: string, metadata: Record<string, unknown> = {}, id = action): AuditLogEntry => ({
  id, action, subjectType: 'register_entry', subjectId: 'r1', metadata,
  actor: { id: 's1', fullName: 'Staff One', email: 's@example.com' }, createdAt: '2026-03-14T02:00:00Z',
})

describe('RegisterEntryScreen', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(notificationsData, 'fetchNotifications').mockResolvedValue([])
    vi.spyOn(registerData, 'fetchRegisterEntry').mockResolvedValue(registerEntryDetail())
  })
  afterEach(() => useAuthStore.setState({ user: null }))

  it('marks a valid entry with the register seal, in words, and no other entry', async () => {
    renderScreen()
    const seal = await screen.findByRole('img', { name: 'Recorded' }, { timeout: 5000 })
    expect(seal).toHaveTextContent('Recorded')
  })

  it('shows the entry: number, status, name, date, minister, details and who entered it', async () => {
    signIn('staff')
    renderScreen()
    expect(await screen.findByText('BAP-2026-0007', {}, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.getByText('Valid')).toBeInTheDocument()
    expect(screen.getAllByText('Juana Dela Cruz').length).toBeGreaterThan(0)
    expect(screen.getByText('Sat, Mar 14, 2026')).toBeInTheDocument()
    expect(screen.getByText('Rev. Fr. Leopoldo S. Evangelista')).toBeInTheDocument()
    // Details sit in groups; the first group starts open, and a shut one says who is in it.
    const parents = screen.getByRole('button', { name: /Parents/ })
    expect(parents).toHaveAttribute('aria-expanded', 'true')
    expect(await screen.findByText('Father')).toBeInTheDocument()
    expect(screen.getByText('Pedro Dela Cruz')).toBeInTheDocument()
    await userEvent.click(parents)
    await waitFor(() => expect(parents).toHaveAttribute('aria-expanded', 'false'))
    expect(parents).toHaveTextContent('Pedro Dela Cruz · Maria Dela Cruz')
    expect(screen.getByText(/Staff One/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Open booking BAPT-20260101-A1B2/ })).toHaveAttribute('href', '/bookings/1')
  })

  it('shows the server message when the entry cannot be loaded', async () => {
    vi.spyOn(registerData, 'fetchRegisterEntry').mockRejectedValue(new Error('No query results.'))
    renderScreen()
    expect(await screen.findByText(/No query results\./)).toBeInTheDocument()
  })

  describe('who can correct, revoke and reinstate', () => {
    it('gives staff none of Correct, Revoke or Reinstate, but the certificate and the paper reference', async () => {
      signIn('staff')
      renderScreen()
      await screen.findByText('BAP-2026-0007')
      expect(screen.queryByRole('button', { name: 'Correct entry' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Revoke entry' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Reinstate entry' })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'View certificate' })).toBeInTheDocument()
      expect(screen.getByLabelText(/^Book no\./)).toBeEnabled()
    })

    it('gives staff no Reinstate on a revoked entry either', async () => {
      signIn('staff')
      vi.spyOn(registerData, 'fetchRegisterEntry').mockResolvedValue(revoked())
      renderScreen()
      await screen.findByText(/Entered for the wrong person/)
      expect(screen.queryByRole('button', { name: 'Reinstate entry' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Revoke entry' })).not.toBeInTheDocument()
    })

    it('gives an admin Correct and Revoke on a valid entry', async () => {
      signIn('admin')
      renderScreen()
      expect(await screen.findByRole('button', { name: 'Correct entry' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Revoke entry' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Reinstate entry' })).not.toBeInTheDocument()
    })

    it('gives an admin Reinstate, not Correct or Revoke, on a revoked entry, and shows why it was revoked', async () => {
      signIn('admin')
      vi.spyOn(registerData, 'fetchRegisterEntry').mockResolvedValue(revoked())
      renderScreen()
      expect(await screen.findByRole('button', { name: 'Reinstate entry' })).toBeInTheDocument()
      expect(screen.getAllByText('Revoked').length).toBeGreaterThan(0)
      expect(screen.getByText(/Entered for the wrong person/)).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Correct entry' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Revoke entry' })).not.toBeInTheDocument()
    })
  })

  describe('correct', () => {
    async function openCorrect() {
      signIn('admin')
      renderScreen()
      await userEvent.click(await screen.findByRole('button', { name: 'Correct entry' }))
      return within(screen.getByRole('dialog', { name: 'Correct this entry' }))
    }

    it('starts from the recorded values and cannot be saved without a change', async () => {
      const panel = await openCorrect()
      expect(panel.getByLabelText(/^Name/)).toHaveValue('Juana Dela Cruz')
      expect(panel.getByLabelText(/^Ceremony date/)).toHaveValue('2026-03-14')
      expect(panel.getByLabelText(/^Minister/)).toHaveValue('Rev. Fr. Leopoldo S. Evangelista')
      await userEvent.type(panel.getByLabelText(/^Reason for the correction/), 'Checked the paper book')
      expect(panel.getByRole('button', { name: 'Save correction' })).toBeDisabled()
      expect(panel.getByText('Change at least one field.')).toBeInTheDocument()
    })

    it('cannot be saved without a reason', async () => {
      const panel = await openCorrect()
      await userEvent.clear(panel.getByLabelText(/^Name/))
      await userEvent.type(panel.getByLabelText(/^Name/), 'Juana M. Dela Cruz')
      expect(panel.getByRole('button', { name: 'Save correction' })).toBeDisabled()
      await userEvent.type(panel.getByLabelText(/^Reason for the correction/), '   ')
      expect(panel.getByRole('button', { name: 'Save correction' })).toBeDisabled()
      await userEvent.type(panel.getByLabelText(/^Reason for the correction/), 'Middle initial left out')
      expect(panel.getByRole('button', { name: 'Save correction' })).toBeEnabled()
    })

    it('sends the reason and only the fields that changed, then closes and refreshes', async () => {
      const spy = vi.spyOn(registerData, 'correctEntry').mockResolvedValue(registerEntry({ subjectName: 'Juana M. Dela Cruz' }))
      const panel = await openCorrect()
      const name = panel.getByLabelText(/^Name/)
      await userEvent.clear(name)
      await userEvent.type(name, 'Juana M. Dela Cruz')
      await userEvent.type(panel.getByLabelText(/^Reason for the correction/), 'Middle initial left out')
      await userEvent.click(panel.getByRole('button', { name: 'Save correction' }))
      await waitFor(() => expect(spy).toHaveBeenCalledWith('r1', { reason: 'Middle initial left out', subjectName: 'Juana M. Dela Cruz' }))
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Correct this entry' })).not.toBeInTheDocument())
    })

    it('sends the details when a row is changed, dropping a row emptied of its value', async () => {
      const spy = vi.spyOn(registerData, 'correctEntry').mockResolvedValue(registerEntry())
      const panel = await openCorrect()
      await userEvent.clear(panel.getByLabelText('Detail value 2'))
      await userEvent.type(panel.getByLabelText(/^Reason for the correction/), 'Mother not named in the book')
      await userEvent.click(panel.getByRole('button', { name: 'Save correction' }))
      await waitFor(() =>
        expect(spy).toHaveBeenCalledWith('r1', { reason: 'Mother not named in the book', details: [{ label: 'Father', value: 'Pedro Dela Cruz' }] }),
      )
    })

    it('shows the server refusal and field errors', async () => {
      vi.spyOn(registerData, 'correctEntry').mockRejectedValue(new Error('A revoked entry cannot be corrected.'))
      const panel = await openCorrect()
      await userEvent.type(panel.getByLabelText(/^Minister/), ' Jr.')
      await userEvent.type(panel.getByLabelText(/^Reason for the correction/), 'Title')
      await userEvent.click(panel.getByRole('button', { name: 'Save correction' }))
      expect(await screen.findByText('A revoked entry cannot be corrected.')).toBeInTheDocument()
    })
  })

  describe('revoke and reinstate', () => {
    it('cannot revoke without a reason, then sends it', async () => {
      signIn('admin')
      const spy = vi.spyOn(registerData, 'revokeEntry').mockResolvedValue(registerEntry({ status: 'revoked' }))
      renderScreen()
      await userEvent.click(await screen.findByRole('button', { name: 'Revoke entry' }))
      const confirm = screen.getByRole('button', { name: 'Revoke entry' })
      expect(confirm).toBeDisabled()
      await userEvent.type(screen.getByLabelText(/^Reason for revoking/), '   ')
      expect(confirm).toBeDisabled()
      await userEvent.type(screen.getByLabelText(/^Reason for revoking/), 'Entered for the wrong person')
      await userEvent.click(confirm)
      await waitFor(() => expect(spy).toHaveBeenCalledWith('r1', 'Entered for the wrong person'))
    })

    it('cannot reinstate without a reason, then sends it', async () => {
      signIn('admin')
      vi.spyOn(registerData, 'fetchRegisterEntry').mockResolvedValue(revoked())
      const spy = vi.spyOn(registerData, 'reinstateEntry').mockResolvedValue(registerEntry())
      renderScreen()
      await userEvent.click(await screen.findByRole('button', { name: 'Reinstate entry' }))
      const confirm = screen.getByRole('button', { name: 'Reinstate entry' })
      expect(confirm).toBeDisabled()
      await userEvent.type(screen.getByLabelText(/^Reason for reinstating/), 'Revoked by mistake')
      await userEvent.click(confirm)
      await waitFor(() => expect(spy).toHaveBeenCalledWith('r1', 'Revoked by mistake'))
    })

    it('shows the server refusal as it is', async () => {
      signIn('admin')
      vi.spyOn(registerData, 'revokeEntry').mockRejectedValue(new Error('This entry is already revoked.'))
      renderScreen()
      await userEvent.click(await screen.findByRole('button', { name: 'Revoke entry' }))
      await userEvent.type(screen.getByLabelText(/^Reason for revoking/), 'x')
      await userEvent.click(screen.getByRole('button', { name: 'Revoke entry' }))
      expect(await screen.findByText('This entry is already revoked.')).toBeInTheDocument()
    })

    it('refreshes the entry and the list after a change', async () => {
      signIn('admin')
      vi.spyOn(registerData, 'revokeEntry').mockResolvedValue(registerEntry({ status: 'revoked' }))
      const { client } = renderScreen()
      const invalidate = vi.spyOn(client, 'invalidateQueries')
      await userEvent.click(await screen.findByRole('button', { name: 'Revoke entry' }))
      await userEvent.type(screen.getByLabelText(/^Reason for revoking/), 'Wrong person')
      await userEvent.click(screen.getByRole('button', { name: 'Revoke entry' }))
      await waitFor(() => {
        expect(invalidate).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['admin-register-entry', 'r1'] }))
        expect(invalidate).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['admin-register'] }))
        expect(invalidate).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['admin-booking', '1'] }))
      })
    })
  })

  describe('paper reference', () => {
    it('shows the recorded book, page and line, and saves a change as typed', async () => {
      signIn('staff')
      vi.spyOn(registerData, 'fetchRegisterEntry').mockResolvedValue(registerEntryDetail({ bookNo: '4', pageNo: '12', lineNo: null }))
      const spy = vi.spyOn(registerData, 'setPaperReference').mockResolvedValue(registerEntry())
      renderScreen()
      expect(await screen.findByLabelText('Book no.')).toHaveValue('4')
      expect(screen.getByLabelText(/^Page no\./)).toHaveValue('12')
      expect(screen.getByRole('button', { name: 'Save paper reference' })).toBeDisabled()

      await userEvent.type(screen.getByLabelText('Line no.'), ' 3 ')
      await userEvent.click(screen.getByRole('button', { name: 'Save paper reference' }))
      await waitFor(() => expect(spy).toHaveBeenCalledWith('r1', { bookNo: '4', pageNo: '12', lineNo: '3' }))
    })

    it('clears a part by sending null for a blank box', async () => {
      signIn('staff')
      vi.spyOn(registerData, 'fetchRegisterEntry').mockResolvedValue(registerEntryDetail({ bookNo: '4', pageNo: '12', lineNo: '3' }))
      const spy = vi.spyOn(registerData, 'setPaperReference').mockResolvedValue(registerEntry())
      renderScreen()
      await userEvent.clear(await screen.findByLabelText('Book no.'))
      await userEvent.clear(screen.getByLabelText(/^Page no\./))
      await userEvent.clear(screen.getByLabelText('Line no.'))
      await userEvent.click(screen.getByRole('button', { name: 'Save paper reference' }))
      await waitFor(() => expect(spy).toHaveBeenCalledWith('r1', { bookNo: null, pageNo: null, lineNo: null }))
    })

    it('shows the refusal when another entry already has that line', async () => {
      signIn('admin')
      vi.spyOn(registerData, 'setPaperReference').mockRejectedValue(new Error('This book entry is already in the register as BAP-1998-0001.'))
      renderScreen()
      await userEvent.type(await screen.findByLabelText('Book no.'), '4')
      await userEvent.type(screen.getByLabelText(/^Page no\./), '12')
      await userEvent.click(screen.getByRole('button', { name: 'Save paper reference' }))
      expect(await screen.findByText('This book entry is already in the register as BAP-1998-0001.')).toBeInTheDocument()
    })
  })

  describe('verification', () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    beforeEach(() => {
      writeText.mockClear()
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    })

    it('shows the code and the link, and copies each', async () => {
      signIn('staff')
      renderScreen()
      expect(await screen.findByText('ABCD-EFGH-JKMN')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
      await waitFor(() => expect(writeText).toHaveBeenCalledWith('ABCD-EFGH-JKMN'))
      fireEvent.click(screen.getByRole('button', { name: 'Copy the check link' }))
      await waitFor(() => expect(writeText).toHaveBeenCalledWith('https://parish.test/verify/BAP-2026-0007/ABCD-EFGH-JKMN'))
      expect(await screen.findByText('Copied')).toBeInTheDocument()
    })

    it('hides the code, the link and the copy buttons for an anointing and says why', async () => {
      signIn('admin')
      vi.spyOn(registerData, 'fetchRegisterEntry').mockResolvedValue(
        registerEntryDetail({ sacrament: 'anointing', register: 'Anointing of the Sick', registerNumber: 'ANO-2026-0001', verifiable: false, verifyCode: null, verifyUrl: null }),
      )
      renderScreen()
      expect(await screen.findByText('Anointing records are not publicly verifiable.')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Copy' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Copy the check link' })).not.toBeInTheDocument()
      expect(screen.queryByText(/ABCD-EFGH/)).not.toBeInTheDocument()
    })
  })

  it('opens the certificate in a new tab through the authenticated loader', async () => {
    signIn('staff')
    const html = vi.spyOn(registerData, 'fetchRegisterCertificateHtml').mockResolvedValue('<html>cert</html>')
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:cert'), revokeObjectURL: vi.fn() })
    renderScreen()
    await userEvent.click(await screen.findByRole('button', { name: 'View certificate' }))
    await waitFor(() => expect(open).toHaveBeenCalledWith('blob:cert', '_blank', 'noopener,noreferrer'))
    expect(html).toHaveBeenCalledWith('r1')
    vi.unstubAllGlobals()
  })

  it('shows the certificate error to the user', async () => {
    signIn('staff')
    vi.spyOn(registerData, 'fetchRegisterCertificateHtml').mockRejectedValue(new Error('No certificate yet.'))
    renderScreen()
    await userEvent.click(await screen.findByRole('button', { name: 'View certificate' }))
    expect(await screen.findByText('No certificate yet.')).toBeInTheDocument()
  })

  it('lists the history in plain English, with the reason for a correction', async () => {
    signIn('staff')
    vi.spyOn(registerData, 'fetchRegisterEntry').mockResolvedValue(
      registerEntryDetail({
        history: [
          audit('register.recorded'),
          audit('register.corrected', { reason: 'Middle initial left out', before: {}, after: {} }),
          audit('register.revoked', { reason: 'Wrong person' }),
        ],
      }),
    )
    renderScreen()
    expect(await screen.findByText('Added to the register')).toBeInTheDocument()
    expect(screen.getByText('Corrected')).toBeInTheDocument()
    expect(screen.getByText('Middle initial left out')).toBeInTheDocument()
    expect(screen.getAllByText('Revoked').length).toBeGreaterThan(0)
  })
})
