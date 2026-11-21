import { useState } from 'react'
import { Upload, Loader2, X } from 'lucide-react'
import { uploadDocument } from '../../lib/data/documents'
import { ApiError } from '../../lib/api/client'
import { prepareUpload, UploadRejected } from '../../lib/prepareUpload'
import { useFieldErrorRole } from '../ui/field'

interface DocumentUploadFieldProps {
  id: string
  label: string
  required?: boolean
  /** Prints "Optional" next to the label (never alongside "Required"). */
  optional?: boolean
  /** A hint under the label, linked to the file input. */
  description?: string
  /** The current form value — a URL once uploaded, empty/undefined otherwise. */
  value: string | undefined
  error?: string
  /** Called with the new URL after an upload, or with '' when the person removes the file. */
  onUploaded: (url: string) => void
}

/** One prerequisite-document upload control (baptismal certificate, marriage
 * license, etc), shared by every sacrament wizard step that needs one.
 *
 * Previously each step's own `pick()` handler did `setValue(field, file.name)`
 * — the file itself never left the browser, so staff had a filename string
 * with nothing to open. This actually uploads the file (via
 * lib/data/documents.ts, which already switches between the real API and the
 * mock layer the same way every other data call does) and commits the
 * returned URL as the form value instead.
 *
 * This component calls `uploadDocument` itself rather than leaving a
 * `useMutation` to its parent: a wizard step has nothing to react to beyond
 * "here's the URL, put it in the form" — there's no booking to mutate yet.
 * Self-contained here avoids repeating a `useMutation` in each of the 9 call
 * sites for no behavioural benefit. */
export function DocumentUploadField({ id, label, required, optional, description, value, error, onUploaded }: DocumentUploadFieldProps) {
  const errorRole = useFieldErrorRole()
  const [uploading, setUploading] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)

  // A value can arrive with no locally-tracked fileName (e.g. the wizard
  // re-mounted this step after already uploading) — fall back to the
  // filename portion of the stored URL rather than showing nothing.
  const displayName = fileName ?? (value ? decodeURIComponent(value.split('/').pop() ?? 'File uploaded') : null)

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setUploadError(null)
    setUploading(true)
    try {
      const { url } = await uploadDocument(await prepareUpload(file))
      onUploaded(url)
    } catch (err) {
      // Say why when we know (too big, wrong type, a signed-out session); only a network failure is a bare "try again".
      const known = err instanceof ApiError || err instanceof UploadRejected
      setUploadError(known && err.message ? err.message : 'Upload failed. Check your connection and try again.')
      setFileName(null)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="mb-3">
      <label htmlFor={id} className="mb-1 flex flex-wrap items-baseline gap-2 text-sm font-medium text-ink">
        <span>{label}</span> {required && <span className="text-label font-normal text-ink-muted">Required</span>}
        {optional && !required && <span className="text-label font-normal text-ink-muted">Optional</span>}
      </label>
      {description && <p id={`${id}-description`} className="mb-1 text-sm text-ink-muted">{description}</p>}
      <label
        className={`flex min-w-0 cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-6 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus ${
          required ? 'border-navy text-navy' : 'border-input-border text-ink-muted'
        }`}
      >
        {uploading ? <Loader2 size={18} className="shrink-0" aria-hidden="true" /> : <Upload size={18} className="shrink-0" aria-hidden="true" />}
        {/* A stored file is named by a long random token; it must not widen the page at phone width. */}
        <span className="min-w-0 truncate">{uploading ? 'Uploading…' : (displayName ?? 'Upload file/picture')}</span>
        <input
          id={id}
          type="file"
          accept="image/jpeg,image/png,.pdf"
          onChange={handleChange}
          disabled={uploading}
          aria-invalid={!!(uploadError || error)}
          aria-describedby={[description ? `${id}-description` : null, uploadError || error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined}
          className="sr-only"
        />
      </label>
      {displayName && !uploading && (
        <button
          type="button"
          onClick={() => {
            // Clears only this file; the rest of the draft stays. Callers receive '' like any empty value.
            setFileName(null)
            setUploadError(null)
            onUploaded('')
          }}
          className="mt-1 inline-flex min-h-[44px] items-center gap-1 text-sm font-medium text-navy underline"
        >
          <X size={14} aria-hidden="true" /> Remove file
        </button>
      )}
      {(uploadError || error) && (
        <p id={`${id}-error`} role={errorRole} className="mt-1 text-sm font-medium text-danger">
          {uploadError ?? error}
        </p>
      )}
    </div>
  )
}
