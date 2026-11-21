import { beforeEach, describe, expect, it, vi } from 'vitest'

const heicTo = vi.fn()
vi.mock('heic-to', () => ({ heicTo: (args: unknown) => heicTo(args) }))

import { prepareUpload, UploadRejected } from './prepareUpload'

const file = (name: string, type: string, bytes = 100) => new File([new Uint8Array(bytes)], name, { type })

// jsdom cannot decode images or draw a canvas, so a HEIC photo always takes the converter path here (the route every
// browser but Safari takes); Safari's own decoding is not covered by these tests.
describe('prepareUpload', () => {
  beforeEach(() => {
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

  it('converts a HEIC photo to a JPEG named .jpg', async () => {
    heicTo.mockResolvedValue(new Blob([new Uint8Array(50)], { type: 'image/jpeg' }))
    const out = await prepareUpload(file('IMG_0042.HEIC', 'image/heic'))
    expect(out.type).toBe('image/jpeg')
    expect(out.name).toBe('IMG_0042.jpg')
    expect(heicTo).toHaveBeenCalledWith(expect.objectContaining({ type: 'image/jpeg' }))
  })

  it('recognises HEIC by its name when the browser reports no type', async () => {
    heicTo.mockResolvedValue(new Blob([new Uint8Array(50)], { type: 'image/jpeg' }))
    const out = await prepareUpload(file('photo.heif', ''))
    expect(out.name).toBe('photo.jpg')
    expect(out.type).toBe('image/jpeg')
  })

  it('says so when a HEIC photo cannot be converted', async () => {
    heicTo.mockRejectedValue(new Error('ERR_LIBHEIF format not supported'))
    await expect(prepareUpload(file('bad.heic', 'image/heic'))).rejects.toThrow(UploadRejected)
    await expect(prepareUpload(file('bad.heic', 'image/heic'))).rejects.toThrow(/could not be read/i)
  })

  it('does not touch the converter for JPG, PNG or PDF', async () => {
    await prepareUpload(file('a.jpg', 'image/jpeg'))
    await prepareUpload(file('a.png', 'image/png'))
    await prepareUpload(file('a.pdf', 'application/pdf'))
    await prepareUpload(file('scan.pdf', ''))
    expect(heicTo).not.toHaveBeenCalled()
  })

  it('still refuses other types and PDFs over 5 MB', async () => {
    await expect(prepareUpload(file('a.gif', 'image/gif'))).rejects.toThrow('Upload a JPG, PNG or PDF file.')
    await expect(prepareUpload(file('big.pdf', 'application/pdf', 5 * 1024 * 1024 + 1))).rejects.toThrow(/larger than 5 MB/)
  })
})
