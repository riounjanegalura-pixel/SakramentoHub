import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom'
import { ApiError } from '../../lib/api/client'
import { DocumentUploadField } from './DocumentUploadField'
import * as documentsData from '../../lib/data/documents'

// The real converter is a ~3 MB WebAssembly build that jsdom cannot run.
const heicTo = vi.hoisted(() => vi.fn())
vi.mock('heic-to', () => ({ heicTo: (args: unknown) => heicTo(args) }))

describe('DocumentUploadField', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    heicTo.mockReset()
    // A browser that cannot decode HEIC fires onerror on the image; jsdom never fires anything, so say it.
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} }))
    vi.stubGlobal(
      'Image',
      class {
        onload: (() => void) | null = null
        onerror: (() => void) | null = null
        set src(_: string) {
          queueMicrotask(() => this.onerror?.())
        }
      },
    )
  })

  // Regression test for the bug where every prerequisite-document input did
  // setValue(field, file.name) — the file never actually uploaded, so staff
  // reviewing a booking saw a filename string with nothing to open.
  it('actually uploads the selected file and reports back the real URL, not the filename', async () => {
    const uploadSpy = vi
      .spyOn(documentsData, 'uploadDocument')
      .mockResolvedValue({ url: 'http://api.test/storage/documents/real-file.jpg' })
    const onUploaded = vi.fn()

    render(
      <DocumentUploadField id="birthCertificate" label="Child Birth Certificate" value={undefined} onUploaded={onUploaded} />,
    )

    const file = new File(['fake image bytes'], 'birth_cert.jpg', { type: 'image/jpeg' })
    const input = document.getElementById('birthCertificate') as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => {
      expect(uploadSpy).toHaveBeenCalledWith(file)
      expect(onUploaded).toHaveBeenCalledWith('http://api.test/storage/documents/real-file.jpg')
    })

    // The button label is the human filename, not the stored URL — but the
    // value actually committed to the form (via onUploaded) is the real URL.
    expect(screen.getByText('birth_cert.jpg')).toBeInTheDocument()
    expect(screen.queryByText(/http/)).not.toBeInTheDocument()
  })

  it('tags an optional document Optional and links its hint to the file input', () => {
    render(
      <DocumentUploadField id="bannsCertificate" label="Banns certificate" description="Can follow later" optional value={undefined} onUploaded={vi.fn()} />,
    )
    expect(screen.getByText('Optional')).toBeInTheDocument()
    expect(screen.queryByText('Required')).not.toBeInTheDocument()
    const input = document.getElementById('bannsCertificate') as HTMLInputElement
    expect(document.getElementById(input.getAttribute('aria-describedby')!)).toHaveTextContent('Can follow later')
  })

  it('shows an uploading state while the request is in flight', async () => {
    let resolveUpload: (v: { url: string }) => void = () => {}
    vi.spyOn(documentsData, 'uploadDocument').mockReturnValue(
      new Promise((resolve) => {
        resolveUpload = resolve
      }),
    )

    render(<DocumentUploadField id="cenomar" label="CENOMAR" value={undefined} onUploaded={vi.fn()} />)

    const file = new File(['x'], 'cenomar.pdf', { type: 'application/pdf' })
    const input = document.getElementById('cenomar') as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => expect(screen.getByText('Uploading…')).toBeInTheDocument())

    resolveUpload({ url: 'http://api.test/storage/documents/cenomar.pdf' })
    await waitFor(() => expect(screen.queryByText('Uploading…')).not.toBeInTheDocument())
  })

  it('shows an error and does not call onUploaded when the upload fails', async () => {
    vi.spyOn(documentsData, 'uploadDocument').mockRejectedValue(new Error('network error'))
    const onUploaded = vi.fn()

    render(<DocumentUploadField id="marriageLicense" label="Marriage License" value={undefined} onUploaded={onUploaded} />)

    const file = new File(['x'], 'license.jpg', { type: 'image/jpeg' })
    const input = document.getElementById('marriageLicense') as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => {
      expect(screen.getByText('Upload failed. Check your connection and try again.')).toBeInTheDocument()
    })
    expect(onUploaded).not.toHaveBeenCalled()
  })

  it('tells the person why when the server refuses the file', async () => {
    vi.spyOn(documentsData, 'uploadDocument').mockRejectedValue(new ApiError('The file is larger than 5 MB. Upload a smaller file.', 422))
    render(<DocumentUploadField id="groomPhoto" label="Groom's 2x2 photo" required value={undefined} onUploaded={vi.fn()} />)

    fireEvent.change(document.getElementById('groomPhoto') as HTMLInputElement, { target: { files: [new File(['x'], 'p.jpg', { type: 'image/jpeg' })] } })

    expect(await screen.findByText('The file is larger than 5 MB. Upload a smaller file.')).toBeInTheDocument()
  })

  it('converts a HEIC photo to a JPEG and uploads that, with no error shown', async () => {
    heicTo.mockResolvedValue(new Blob(['jpeg bytes'], { type: 'image/jpeg' }))
    const upload = vi.spyOn(documentsData, 'uploadDocument').mockResolvedValue({ url: '/documents/u/p.jpg' })
    const onUploaded = vi.fn()
    render(<DocumentUploadField id="groomPhoto" label="Groom's 2x2 photo" required value={undefined} onUploaded={onUploaded} />)

    fireEvent.change(document.getElementById('groomPhoto') as HTMLInputElement, { target: { files: [new File(['x'], 'p.heic', { type: 'image/heic' })] } })

    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith('/documents/u/p.jpg'))
    const sent = upload.mock.calls[0][0] as File
    expect(sent.name).toBe('p.jpg')
    expect(sent.type).toBe('image/jpeg')
    expect(screen.queryByText(/could not be read|not accepted/i)).not.toBeInTheDocument()
  })

  it('says so, and sends nothing, when a HEIC photo cannot be converted', async () => {
    heicTo.mockRejectedValue(new Error('ERR_LIBHEIF format not supported'))
    const upload = vi.spyOn(documentsData, 'uploadDocument')
    render(<DocumentUploadField id="groomPhoto" label="Groom's 2x2 photo" required value={undefined} onUploaded={vi.fn()} />)

    fireEvent.change(document.getElementById('groomPhoto') as HTMLInputElement, { target: { files: [new File(['x'], 'p.heic', { type: 'image/heic' })] } })

    expect(await screen.findByText(/could not be read/i)).toBeInTheDocument()
    expect(upload).not.toHaveBeenCalled()
  })

  it('derives a display name from an already-uploaded URL when no local filename is tracked', () => {
    render(
      <DocumentUploadField
        id="birthCertificate"
        label="Child Birth Certificate"
        value="http://api.test/storage/documents/abc123-birth-cert.jpg"
        onUploaded={vi.fn()}
      />,
    )

    expect(screen.getByText('abc123-birth-cert.jpg')).toBeInTheDocument()
  })
})
