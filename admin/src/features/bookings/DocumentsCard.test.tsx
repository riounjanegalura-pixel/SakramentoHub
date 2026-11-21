import { beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DocumentsCard } from './DocumentsCard'
import * as bookingsData from '../../lib/data/bookings'
import * as documentsData from '../../lib/data/documents'
import * as client from '../../lib/api/client'
import { renderWithProviders } from '../../test/render'
import { adminBooking, bookingDocument } from '../../test/factories'
import type { AdminBooking } from '../../lib/types'

const docs = [
  bookingDocument({ key: 'birthCertificate', label: 'Birth certificate', required: true, url: '/documents/u1/birth.pdf' }),
  bookingDocument({
    key: 'marriageContract', label: 'Marriage contract', required: false, url: '/documents/u1/marriage.jpg',
    review: { status: 'accepted', note: null, reviewedBy: 'Staff One', reviewedAt: '2026-11-02T01:00:00Z' },
  }),
  bookingDocument({
    key: 'baptismalCertificate', label: 'Baptismal certificate', required: true, url: '/documents/u1/baptismal.pdf',
    review: { status: 'rejected', note: 'Blurry', reviewedBy: 'Staff One', reviewedAt: '2026-11-02T01:00:00Z' },
  }),
  bookingDocument({ key: 'cenomar', label: 'CENOMAR', required: true, url: null }),
]

const booking = (o: Partial<AdminBooking> = {}) => adminBooking({ id: 'b1', status: 'submitted', documents: docs, ...o })

function row(label: string) {
  return within(screen.getByRole('listitem', { name: label }))
}

describe('DocumentsCard', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:preview'), revokeObjectURL: vi.fn() })
  })

  it('renders nothing for a sacrament without documents', () => {
    const { container } = renderWithProviders(<DocumentsCard booking={booking({ documents: [] })} onChanged={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('lists each document with its type, whether it is required, and its state in words', () => {
    renderWithProviders(<DocumentsCard booking={booking()} onChanged={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'Documents' })).toBeInTheDocument()
    expect(row('Birth certificate').getByText('PDF · Required')).toBeInTheDocument()
    expect(row('Birth certificate').getByText('Not reviewed')).toBeInTheDocument()
    expect(row('Marriage contract').getByText('JPG · Optional')).toBeInTheDocument()
    expect(row('Marriage contract').getByText('Accepted')).toBeInTheDocument()
    expect(row('Baptismal certificate').getByText('Rejected')).toBeInTheDocument()
    expect(row('Baptismal certificate').getByText('Rejected: Blurry')).toBeInTheDocument()
    expect(row('CENOMAR').getByText('Not uploaded')).toBeInTheDocument()
    expect(row('CENOMAR').queryByRole('button')).not.toBeInTheDocument()
  })

  it('says Review for a file waiting on a decision, and View once it has one', () => {
    renderWithProviders(<DocumentsCard booking={booking()} onChanged={vi.fn()} />)
    expect(row('Birth certificate').getByRole('button', { name: 'Review Birth certificate' })).toBeInTheDocument()
    expect(row('Marriage contract').getByRole('button', { name: 'View Marriage contract' })).toBeInTheDocument()
  })

  describe('the document drawer', () => {
    async function open(label: string, b = booking()) {
      renderWithProviders(<DocumentsCard booking={b} onChanged={vi.fn()} />)
      await userEvent.click(row(label).getByRole('button', { name: new RegExp(`${label}$`) }))
      return screen.findByRole('dialog', { name: label })
    }

    it('accepts a document and hands the updated booking to the parent', async () => {
      const updated = booking({ statusLabel: 'updated' })
      const spy = vi.spyOn(bookingsData, 'reviewDocument').mockResolvedValue(updated)
      vi.spyOn(client, 'apiFetchBlob').mockResolvedValue(new Blob(['x'], { type: 'application/pdf' }))
      const onChanged = vi.fn()
      renderWithProviders(<DocumentsCard booking={booking()} onChanged={onChanged} />)
      await userEvent.click(screen.getByRole('button', { name: 'Review Birth certificate' }))
      const drawer = await screen.findByRole('dialog', { name: 'Birth certificate' })
      await userEvent.click(within(drawer).getByRole('radio', { name: 'Accept' }))
      await userEvent.click(within(drawer).getByRole('button', { name: 'Save review' }))
      await waitFor(() => expect(onChanged).toHaveBeenCalledWith(updated))
      expect(spy).toHaveBeenCalledWith('b1', 'birthCertificate', 'accepted', undefined)
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    })

    it('asks for Accept or Reject before saving', async () => {
      const spy = vi.spyOn(bookingsData, 'reviewDocument')
      vi.spyOn(client, 'apiFetchBlob').mockResolvedValue(new Blob(['x']))
      const drawer = await open('Birth certificate')
      await userEvent.click(within(drawer).getByRole('button', { name: 'Save review' }))
      expect(within(drawer).getByText('Choose Accept or Reject.')).toBeInTheDocument()
      expect(spy).not.toHaveBeenCalled()
    })

    it('rejecting needs words the parishioner reads, said as an instruction', async () => {
      const spy = vi.spyOn(bookingsData, 'reviewDocument').mockResolvedValue(booking())
      vi.spyOn(client, 'apiFetchBlob').mockResolvedValue(new Blob(['x']))
      const drawer = await open('Birth certificate')
      expect(within(drawer).queryByLabelText(/What is wrong with it/)).not.toBeInTheDocument()
      await userEvent.click(within(drawer).getByRole('radio', { name: 'Reject' }))
      await userEvent.click(within(drawer).getByRole('button', { name: 'Save review' }))
      expect(within(drawer).getByText('Write what is wrong. The parishioner reads it.')).toBeInTheDocument()
      expect(spy).not.toHaveBeenCalled()
      await userEvent.type(within(drawer).getByLabelText(/^What is wrong with it/), 'Blurry, please re-upload')
      await userEvent.click(within(drawer).getByRole('button', { name: 'Save review' }))
      await waitFor(() => expect(spy).toHaveBeenCalledWith('b1', 'birthCertificate', 'rejected', 'Blurry, please re-upload'))
    })

    it('shows the server refusal inside the drawer', async () => {
      vi.spyOn(bookingsData, 'reviewDocument').mockRejectedValue(new Error('Review refused.'))
      vi.spyOn(client, 'apiFetchBlob').mockResolvedValue(new Blob(['x']))
      const drawer = await open('Birth certificate')
      await userEvent.click(within(drawer).getByRole('radio', { name: 'Accept' }))
      await userEvent.click(within(drawer).getByRole('button', { name: 'Save review' }))
      expect(await within(drawer).findByText('Review refused.')).toBeInTheDocument()
    })

    it('is read-only once the booking is no longer awaiting review: the file and what was decided, no review controls', async () => {
      vi.spyOn(client, 'apiFetchBlob').mockResolvedValue(new Blob(['x']))
      const drawer = await open('Marriage contract', booking({ status: 'approved' }))
      expect(within(drawer).queryByRole('radio')).not.toBeInTheDocument()
      expect(within(drawer).queryByRole('button', { name: 'Save review' })).not.toBeInTheDocument()
      expect(within(drawer).getByText('Accepted by Staff One.')).toBeInTheDocument()
    })

    it('says it is loading, then shows a PDF by its real type even when the file name has no .pdf, with Open and Download', async () => {
      vi.spyOn(client, 'apiFetchBlob').mockResolvedValue(new Blob(['x'], { type: 'application/pdf' }))
      const drawer = await open('Birth certificate', booking({ documents: [bookingDocument({ key: 'birthCertificate', label: 'Birth certificate', required: true, url: '/documents/u1/abc123' })] }))
      expect(await within(drawer).findByTitle('Birth certificate')).toHaveAttribute('type', 'application/pdf')
      expect(within(drawer).getByRole('link', { name: 'Download' })).toHaveAttribute('href', 'blob:preview')
      expect(within(drawer).getByRole('link', { name: 'Open in a new tab' })).toHaveAttribute('href', 'blob:preview')
      expect(within(drawer).getByText('PDF file')).toBeInTheDocument()
    })

    it('shows a loading state while the file comes in', async () => {
      vi.spyOn(client, 'apiFetchBlob').mockReturnValue(new Promise(() => {}))
      const drawer = await open('Birth certificate')
      expect(within(drawer).getByRole('status')).toHaveTextContent('Loading the file')
    })

    it('says in words that the file did not load, and what to do', async () => {
      vi.spyOn(client, 'apiFetchBlob').mockRejectedValue(new Error('Gone'))
      const drawer = await open('Birth certificate')
      expect(await within(drawer).findByRole('alert')).toHaveTextContent('This file did not load.')
      // The review controls stay: a clerk can still say the upload is unusable.
      expect(within(drawer).getByRole('radio', { name: 'Reject' })).toBeInTheDocument()
    })

    it('downloads under a file name made from the label, with the extension of the real file type', async () => {
      vi.spyOn(client, 'apiFetchBlob').mockResolvedValue(new Blob(['x'], { type: 'application/pdf' }))
      const drawer = await open('Birth certificate', booking({ documents: [bookingDocument({ key: 'birthCertificate', label: 'Birth certificate', required: true, url: '/documents/u1/9f1c2a7e-uuid' })] }))
      expect(await within(drawer).findByRole('link', { name: 'Download' })).toHaveAttribute('download', 'Birth-certificate.pdf')
    })

    it('names an image download by its type, and falls back to the url extension when the type is unknown', async () => {
      const blob = vi.spyOn(client, 'apiFetchBlob').mockResolvedValue(new Blob(['x'], { type: 'image/jpeg' }))
      const one = renderWithProviders(
        <DocumentsCard booking={booking({ documents: [bookingDocument({ key: 'cenomar', label: 'CENOMAR / PSA (copy)', required: true, url: '/documents/u1/abc' })] })} onChanged={vi.fn()} />,
      )
      await userEvent.click(screen.getByRole('button', { name: 'Review CENOMAR / PSA (copy)' }))
      expect(await screen.findByRole('link', { name: 'Download' })).toHaveAttribute('download', 'CENOMAR-PSA-copy.jpg')
      one.unmount()

      blob.mockResolvedValue(new Blob(['x']))
      renderWithProviders(
        <DocumentsCard booking={booking({ documents: [bookingDocument({ key: 'marriageContract', label: 'Marriage contract', required: false, url: '/documents/u1/marriage.png' })] })} onChanged={vi.fn()} />,
      )
      await userEvent.click(screen.getByRole('button', { name: 'Review Marriage contract' }))
      expect(await screen.findByRole('link', { name: 'Download' })).toHaveAttribute('download', 'Marriage-contract.png')
    })

    it('previews a PDF inline and an image as an image, through the authenticated loader', async () => {
      const blobSpy = vi.spyOn(client, 'apiFetchBlob').mockResolvedValue(new Blob(['x']))
      renderWithProviders(<DocumentsCard booking={booking()} onChanged={vi.fn()} />)

      await userEvent.click(screen.getByRole('button', { name: 'Review Birth certificate' }))
      expect(await screen.findByTitle('Birth certificate')).toHaveAttribute('data', 'blob:preview')
      expect(blobSpy).toHaveBeenCalledWith('/documents/u1/birth.pdf')
      await userEvent.keyboard('{Escape}')
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

      await userEvent.click(screen.getByRole('button', { name: 'View Marriage contract' }))
      expect(await screen.findByRole('img', { name: 'Marriage contract' })).toHaveAttribute('src', 'blob:preview')
      expect(blobSpy).toHaveBeenCalledWith('/documents/u1/marriage.jpg')
    })

    it('closes on Escape and gives focus back to the button that opened it', async () => {
      vi.spyOn(client, 'apiFetchBlob').mockResolvedValue(new Blob(['x']))
      renderWithProviders(<DocumentsCard booking={booking()} onChanged={vi.fn()} />)
      const opener = screen.getByRole('button', { name: 'Review Birth certificate' })
      await userEvent.click(opener)
      await screen.findByRole('dialog', { name: 'Birth certificate' })
      await userEvent.keyboard('{Escape}')
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      await waitFor(() => expect(opener).toHaveFocus())
    })
  })

  describe('weddings after approval', () => {
    const late = [
      bookingDocument({ key: 'marriageLicense', label: 'Marriage license', required: false, url: '/documents/u1/lic.pdf' }),
      bookingDocument({ key: 'preCanaCertificate', label: 'Pre-Cana certificate', required: false, url: null }),
      bookingDocument({ key: 'bannsCertificate', label: 'Banns certificate', required: false, url: '/documents/u1/banns.pdf' }),
      bookingDocument({ key: 'confessionCertificate', label: 'Confession certificate', required: false, url: '/documents/u1/conf.pdf' }),
      bookingDocument({ key: 'birthCertificate', label: 'Birth certificate', required: true, url: '/documents/u1/birth.pdf' }),
    ]
    const wedding = (o: Partial<AdminBooking> = {}) => booking({ sacrament: 'wedding', status: 'approved', documents: late, ...o })

    it('lets staff review the late documents on an approved wedding', async () => {
      const spy = vi.spyOn(bookingsData, 'reviewDocument').mockResolvedValue(wedding())
      vi.spyOn(client, 'apiFetchBlob').mockResolvedValue(new Blob(['x']))
      renderWithProviders(<DocumentsCard booking={wedding()} onChanged={vi.fn()} />)
      for (const label of ['Marriage license', 'Banns certificate', 'Confession certificate']) {
        expect(screen.getByRole('button', { name: `Review ${label}` })).toBeInTheDocument()
      }
      await userEvent.click(screen.getByRole('button', { name: 'Review Marriage license' }))
      const drawer = await screen.findByRole('dialog', { name: 'Marriage license' })
      await userEvent.click(within(drawer).getByRole('radio', { name: 'Accept' }))
      await userEvent.click(within(drawer).getByRole('button', { name: 'Save review' }))
      await waitFor(() => expect(spy).toHaveBeenCalledWith('b1', 'marriageLicense', 'accepted', undefined))
    })

    it('keeps every other document read-only on an approved wedding', () => {
      renderWithProviders(<DocumentsCard booking={wedding()} onChanged={vi.fn()} />)
      expect(screen.queryByRole('button', { name: 'Review Birth certificate' })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'View Birth certificate' })).toBeInTheDocument()
    })

    it('does not open the late documents on an approved non-wedding', () => {
      renderWithProviders(<DocumentsCard booking={wedding({ sacrament: 'baptism' })} onChanged={vi.fn()} />)
      expect(screen.queryByRole('button', { name: 'Review Marriage license' })).not.toBeInTheDocument()
    })

    it('does not open them on a completed wedding', () => {
      renderWithProviders(<DocumentsCard booking={wedding({ status: 'completed' })} onChanged={vi.fn()} />)
      expect(screen.queryByRole('button', { name: 'Review Marriage license' })).not.toBeInTheDocument()
    })

    describe('a walk-in wedding', () => {
      const hint = 'Walk-in wedding: add the paper copy here, or confirm each step with a note when it is shown at the office.'

      it('says the steps are confirmed with a note, and offers no desk link', () => {
        renderWithProviders(<DocumentsCard booking={wedding({ channel: 'walk_in' })} onChanged={vi.fn()} />)
        expect(screen.getByText(hint)).toBeInTheDocument()
        expect(screen.queryByRole('link')).not.toBeInTheDocument()
      })

      it('says nothing of the kind for an online booking', () => {
        renderWithProviders(<DocumentsCard booking={wedding()} onChanged={vi.fn()} />)
        expect(screen.queryByText(hint)).not.toBeInTheDocument()
      })
    })

    describe('adding a file for a walk-in', () => {
      const file = () => new File(['x'], 'lic.pdf', { type: 'application/pdf' })

      it('offers a file control on the four late documents of a walk-in wedding only', () => {
        renderWithProviders(<DocumentsCard booking={wedding({ channel: 'walk_in' })} onChanged={vi.fn()} />)
        expect(screen.getByLabelText('Replace file for Marriage license')).toBeInTheDocument()
        expect(screen.getByLabelText('Add file for Pre-Cana certificate')).toBeInTheDocument()
        expect(screen.getByLabelText('Replace file for Banns certificate')).toBeInTheDocument()
        expect(screen.getByLabelText('Replace file for Confession certificate')).toBeInTheDocument()
        expect(screen.queryByLabelText(/file for Birth certificate/)).not.toBeInTheDocument()
      })

      it('is not offered for an online wedding, a completed wedding or another sacrament', () => {
        for (const b of [wedding(), wedding({ channel: 'walk_in', status: 'completed' }), wedding({ channel: 'walk_in', sacrament: 'baptism' })]) {
          const { unmount } = renderWithProviders(<DocumentsCard booking={b} onChanged={vi.fn()} />)
          expect(screen.queryByLabelText(/^(Add|Replace) file for /)).not.toBeInTheDocument()
          unmount()
        }
      })

      it('uploads the file, attaches it and hands the updated booking back', async () => {
        const user = userEvent.setup()
        const updated = wedding({ channel: 'walk_in' })
        const upload = vi.spyOn(documentsData, 'uploadDocument').mockResolvedValue({ url: '/documents/s1/lic.pdf' })
        const attach = vi.spyOn(bookingsData, 'attachLateDocument').mockResolvedValue(updated)
        const onChanged = vi.fn()
        renderWithProviders(<DocumentsCard booking={wedding({ channel: 'walk_in', id: 'w9' })} onChanged={onChanged} />)

        await user.upload(screen.getByLabelText('Add file for Pre-Cana certificate'), file())

        await waitFor(() => expect(onChanged).toHaveBeenCalledWith(updated))
        expect(upload).toHaveBeenCalledTimes(1)
        expect(attach).toHaveBeenCalledWith('w9', 'preCanaCertificate', '/documents/s1/lic.pdf')
      })

      it('shows its state in visible text: Add file, then Uploading while the file goes up (and the control is disabled)', async () => {
        const user = userEvent.setup()
        vi.spyOn(documentsData, 'uploadDocument').mockReturnValue(new Promise(() => {}))
        renderWithProviders(<DocumentsCard booking={wedding({ channel: 'walk_in', id: 'w9' })} onChanged={vi.fn()} />)
        const input = screen.getByLabelText('Add file for Pre-Cana certificate')
        const control = input.closest('label')!
        expect(control).toHaveTextContent('Add file')
        await user.upload(input, file())
        await waitFor(() => expect(control).toHaveTextContent('Uploading…'))
        expect(input).toBeDisabled()
        expect(row('Pre-Cana certificate').getByRole('status')).toHaveTextContent('Uploading the file for Pre-Cana certificate…')
      })

      it('offers only the file types the server accepts', () => {
        renderWithProviders(<DocumentsCard booking={wedding({ channel: 'walk_in', id: 'w9' })} onChanged={vi.fn()} />)
        expect(screen.getByLabelText('Add file for Pre-Cana certificate')).toHaveAttribute('accept', '.jpg,.jpeg,.png,.pdf')
      })

      it('shows the error and changes nothing when the upload fails', async () => {
        const user = userEvent.setup()
        vi.spyOn(documentsData, 'uploadDocument').mockRejectedValue(new Error('The file may not be greater than 5120 kilobytes.'))
        const attach = vi.spyOn(bookingsData, 'attachLateDocument')
        const onChanged = vi.fn()
        renderWithProviders(<DocumentsCard booking={wedding({ channel: 'walk_in' })} onChanged={onChanged} />)

        await user.upload(screen.getByLabelText('Add file for Pre-Cana certificate'), file())

        expect(await screen.findByRole('alert')).toHaveTextContent('5120 kilobytes')
        expect(attach).not.toHaveBeenCalled()
        expect(onChanged).not.toHaveBeenCalled()
      })

      it('shows the error and changes nothing when the attach is refused', async () => {
        const user = userEvent.setup()
        vi.spyOn(documentsData, 'uploadDocument').mockResolvedValue({ url: '/documents/s1/lic.pdf' })
        vi.spyOn(bookingsData, 'attachLateDocument').mockRejectedValue(new Error('The office can add documents only to a walk-in booking.'))
        const onChanged = vi.fn()
        renderWithProviders(<DocumentsCard booking={wedding({ channel: 'walk_in' })} onChanged={onChanged} />)

        await user.upload(screen.getByLabelText('Add file for Pre-Cana certificate'), file())

        expect(await screen.findByRole('alert')).toHaveTextContent('only to a walk-in booking')
        expect(onChanged).not.toHaveBeenCalled()
      })
    })
  })
})
