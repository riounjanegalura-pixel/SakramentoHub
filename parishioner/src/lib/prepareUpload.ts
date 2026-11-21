/** What the server accepts: JPG, PNG or PDF up to 5 MB. */
const ALLOWED = ['image/jpeg', 'image/png', 'application/pdf']
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024
// Phone photos are often 3 to 8 MB; anything bigger than this is shrunk before it is sent (also keeps slow data quick).
const SHRINK_ABOVE_BYTES = 1.5 * 1024 * 1024
const MAX_SIDE_PX = 2200

export class UploadRejected extends Error {}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('unreadable image'))
    }
    img.src = url
  })
}

const HEIC_TYPES = ['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence']

/** iPhones (and some other phones) save photos as HEIC; browsers often report no type for them, so the name counts too. */
function isHeicFile(file: File): boolean {
  return HEIC_TYPES.includes(file.type) || /\.(heic|heif)$/i.test(file.name)
}

/**
 * Turns a HEIC photo into a JPEG the server accepts. Safari decodes HEIC itself, so it is tried first and costs nothing;
 * every other browser loads the converter, a large file fetched only when someone actually picks a HEIC photo.
 */
async function heicToJpeg(file: File): Promise<File> {
  const name = file.name.replace(/\.\w+$/, '') + '.jpg'
  let blob: Blob | null = null
  try {
    const img = await loadImage(file)
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    canvas.getContext('2d')!.drawImage(img, 0, 0)
    blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
  } catch {
    // This browser cannot show HEIC: use the converter.
  }
  if (!blob) {
    try {
      const { heicTo } = await import('heic-to')
      blob = await heicTo({ blob: file, type: 'image/jpeg', quality: 0.85 })
    } catch {
      throw new UploadRejected('This photo could not be read. Take it again, or choose a JPG or PNG.')
    }
  }
  return new File([blob], name, { type: 'image/jpeg' })
}

/**
 * Checks the file the way the server will and shrinks a large photo, so a failed upload says why up front
 * ("too big", "wrong type") instead of a bare "Upload failed". A HEIC photo is converted to JPEG first. A PDF is only size-checked.
 */
export async function prepareUpload(original: File): Promise<File> {
  const file = isHeicFile(original) ? await heicToJpeg(original) : original
  const type = file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : '')
  if (!ALLOWED.includes(type)) {
    throw new UploadRejected('Upload a JPG, PNG or PDF file.')
  }
  if (type === 'application/pdf') {
    if (file.size > MAX_UPLOAD_BYTES) throw new UploadRejected('The PDF is larger than 5 MB. Upload a smaller file.')
    return file
  }
  if (file.size <= SHRINK_ABOVE_BYTES) return file

  try {
    const img = await loadImage(file)
    const scale = Math.min(1, MAX_SIDE_PX / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.naturalWidth * scale)
    canvas.height = Math.round(img.naturalHeight * scale)
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
    if (blob && blob.size < file.size) return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch {
    // Could not shrink it here: send it as it is and let the size check below speak.
  }
  if (file.size > MAX_UPLOAD_BYTES) throw new UploadRejected('The photo is larger than 5 MB. Take it again at a lower quality or choose a smaller file.')
  return file
}
