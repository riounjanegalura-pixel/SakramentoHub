import { useEffect, useId, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { reviewDocument } from '../../lib/data/bookings'
import { useAuthenticatedBlobUrl } from '../../lib/hooks/useAuthenticatedBlobUrl'
import { useIsPhone } from '../../lib/hooks/useIsPhone'
import type { AdminBooking, BookingDocument } from '../../lib/types'
import { cn } from '../../lib/utils'
import { FieldError, FieldLabel, FOCUS, OUTLINE_BTN, TEXTAREA } from './parts'

const NOTE_MAX = 500 // server limit (BookingDocumentController)

/** A PDF by its real type; when the server gave none, by the file name. */
function isPdf(contentType: string | null, url: string): boolean {
  if (contentType) return contentType === 'application/pdf'
  return /\.pdf$/i.test(url)
}

const EXTENSION_BY_TYPE: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' }

/**
 * The name a download is saved under: the document's label made safe for a file name, plus the extension of
 * the real file type (or, when the server gave none, of the stored path). Stored paths are random ids.
 */
function downloadName(label: string, contentType: string | null, url: string): string {
  const base = label.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'document'
  const fromUrl = /\.(pdf|jpe?g|png)$/i.exec(url)?.[1].toLowerCase().replace('jpeg', 'jpg')
  const ext = (contentType ? EXTENSION_BY_TYPE[contentType] : undefined) ?? fromUrl
  return ext ? `${base}.${ext}` : base
}

const FRAME = 'flex h-[380px] items-center justify-center rounded-xl border border-line bg-paper-deep p-6'

/** The file itself, fetched with the staff token. Loading, failure and both file kinds each say what they are. */
function Preview({ doc, onType }: { doc: BookingDocument & { url: string }; onType: (kind: string | null) => void }) {
  const { blobUrl, contentType, isLoading, error } = useAuthenticatedBlobUrl(doc.url)
  const pdf = isPdf(contentType, doc.url)
  useEffect(() => {
    onType(blobUrl ? (pdf ? 'PDF' : contentType === 'image/png' ? 'PNG' : 'JPG') : null)
  }, [blobUrl, pdf, contentType, onType])

  if (isLoading) {
    return (
      <div role="status" aria-busy="true" className={FRAME}>
        <p className="text-[14px] text-ink-muted">Loading the file…</p>
      </div>
    )
  }
  if (error || !blobUrl) {
    return (
      <div role="alert" className={cn(FRAME, 'flex-col gap-1 text-center')}>
        <p className="text-[15px] font-semibold text-danger">This file did not load.</p>
        <p className="text-[14px] text-ink-muted">Close this panel and open the document again. If it keeps failing, ask the parishioner to upload it again.</p>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-3">
      {pdf ? (
        // Phones often cannot draw a PDF inside the page, so the links below are always the way out.
        <object title={doc.label} data={blobUrl} type="application/pdf" className="h-[380px] w-full rounded-xl border border-line bg-paper-deep">
          <p className="p-3 text-[14px] text-ink-muted">This browser can&apos;t show the PDF here. Use Open in a new tab or Download below.</p>
        </object>
      ) : (
        <div className={cn(FRAME, 'overflow-hidden p-2')}>
          <img src={blobUrl} alt={doc.label} className="max-h-full max-w-full object-contain" />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-4 text-[13px] text-ink-muted">
        <a href={blobUrl} target="_blank" rel="noreferrer" className={`inline-flex min-h-11 items-center font-semibold text-navy underline underline-offset-[3px] ${FOCUS}`}>
          Open in a new tab
        </a>
        <a href={blobUrl} download={downloadName(doc.label, contentType, doc.url)} className={`inline-flex min-h-11 items-center font-semibold text-navy underline underline-offset-[3px] ${FOCUS}`}>
          Download
        </a>
      </div>
    </div>
  )
}

type Verdict = 'accepted' | 'rejected' | null

/**
 * Review one document beside the booking: the file, then Accept or Reject. A reject needs words the parishioner
 * reads. When the booking is past review the drawer only shows the file and what was decided.
 */
export function DocumentDrawer({
  booking,
  doc,
  canReview,
  open,
  onOpenChange,
  onChanged,
  onCloseAutoFocus,
}: {
  booking: AdminBooking
  doc: BookingDocument | null
  canReview: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onChanged: (b: AdminBooking) => void
  onCloseAutoFocus?: (event: Event) => void
}) {
  const id = useId()
  const phone = useIsPhone()
  // The last document stays on screen while the drawer slides out.
  const last = useRef<BookingDocument | null>(null)
  if (doc) last.current = doc
  const shown = doc ?? last.current
  const [verdict, setVerdict] = useState<Verdict>(null)
  const [note, setNote] = useState('')
  const [touched, setTouched] = useState(false)
  const [kind, setKind] = useState<string | null>(null)
  const noteField = useRef<HTMLTextAreaElement>(null)

  const review = useMutation({
    mutationFn: ({ status, text }: { status: 'accepted' | 'rejected'; text?: string }) => reviewDocument(booking.id, shown!.key, status, text),
    onSuccess: (updated) => {
      onChanged(updated)
      onOpenChange(false)
    },
  })

  useEffect(() => {
    if (open && doc) {
      setVerdict(doc.review?.status ?? null)
      setNote(doc.review?.status === 'rejected' ? (doc.review.note ?? '') : '')
      setTouched(false)
      setKind(null)
      review.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, doc?.key])

  const noVerdict = touched && verdict === null
  const noNote = touched && verdict === 'rejected' && !note.trim()

  function save() {
    if (verdict === null) {
      setTouched(true)
      return
    }
    if (verdict === 'rejected' && !note.trim()) {
      setTouched(true)
      noteField.current?.focus()
      return
    }
    review.mutate(verdict === 'accepted' ? { status: 'accepted' } : { status: 'rejected', text: note.trim() })
  }

  const decided =
    shown?.review?.status === 'accepted'
      ? `Accepted${shown.review.reviewedBy ? ` by ${shown.review.reviewedBy}` : ''}.`
      : shown?.review?.status === 'rejected'
        ? `Rejected${shown.review.reviewedBy ? ` by ${shown.review.reviewedBy}` : ''}: ${shown.review.note ?? ''}`
        : 'Not reviewed yet.'

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={phone ? 'bottom' : 'right'}
        showCloseButton={false}
        onCloseAutoFocus={onCloseAutoFocus}
        className={cn('gap-[18px] overflow-y-auto p-6', phone ? 'max-h-[94vh] rounded-t-[20px] bg-paper px-4 pb-6 pt-2.5' : 'w-full sm:max-w-[560px]')}
      >
        {phone && <div aria-hidden="true" className="mx-auto h-1 w-10 rounded-sm bg-hollow" />}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="mb-1 text-[13px] text-ink-muted">
              {booking.subjectName} · <span className="font-mono" translate="no">{booking.referenceNumber}</span>
            </p>
            <SheetTitle className="font-display text-[24px] font-semibold leading-tight text-navy">{shown?.label ?? 'Document'}</SheetTitle>
            <SheetDescription className="sr-only">The uploaded file, and your review of it.</SheetDescription>
          </div>
          <SheetClose aria-label="Close" className={`-mr-2 -mt-1.5 flex size-11 shrink-0 items-center justify-center rounded-[10px] text-navy hover:bg-paper ${FOCUS}`}>
            <X size={22} aria-hidden="true" />
          </SheetClose>
        </div>

        {shown && shown.url !== null && open && <Preview key={shown.key} doc={{ ...shown, url: shown.url }} onType={setKind} />}
        {shown && shown.url === null && (
          <div className={cn(FRAME, 'flex-col gap-1 text-center')}>
            <p className="text-[15px] font-semibold text-ink">Nothing uploaded yet</p>
            <p className="text-[14px] text-ink-muted">{shown.required ? 'This document is required. The parishioner can add it from their booking.' : 'This document is optional and can be added later.'}</p>
          </div>
        )}
        {kind && <p className="-mt-3 text-[13px] text-ink-muted">{kind} file</p>}

        {shown && shown.url !== null && canReview ? (
          <>
            <fieldset className="flex flex-col gap-2.5 border-0 p-0">
              <legend className="mb-2 p-0 text-[14px] font-semibold text-ink">Your review</legend>
              {(['accepted', 'rejected'] as const).map((v) => {
                const on = verdict === v
                return (
                  <label key={v} className={cn('flex min-h-12 cursor-pointer items-center gap-3 rounded-xl bg-surface px-3.5 py-3', on ? 'border-2 border-navy' : 'border border-input-border')}>
                    <input type="radio" name={`${id}-verdict`} checked={on} onChange={() => setVerdict(v)} className={cn('size-5', FOCUS)} />
                    <span className="text-[15px] font-semibold text-ink">{v === 'accepted' ? 'Accept' : 'Reject'}</span>
                  </label>
                )
              })}
              {noVerdict && <FieldError>Choose Accept or Reject.</FieldError>}
            </fieldset>

            {verdict === 'rejected' && (
              <div className="flex flex-col gap-1.5">
                <FieldLabel htmlFor={`${id}-why`}>What is wrong with it?</FieldLabel>
                <textarea
                  id={`${id}-why`}
                  ref={noteField}
                  rows={3}
                  maxLength={NOTE_MAX}
                  value={note}
                  placeholder="For example: the scan is blurry. Please upload a clearer copy."
                  aria-invalid={noNote ? true : undefined}
                  aria-describedby={noNote ? `${id}-why-error` : undefined}
                  onChange={(e) => setNote(e.target.value)}
                  className={cn(TEXTAREA, 'resize-y', FOCUS, noNote && 'border-danger')}
                />
                {noNote && <FieldError id={`${id}-why-error`}>Write what is wrong. The parishioner reads it.</FieldError>}
              </div>
            )}
            {review.isError && <FieldError>{(review.error as Error).message}</FieldError>}

            <div className={cn('mt-auto flex gap-2.5', phone ? 'flex-col-reverse [&>*]:w-full' : 'justify-end')}>
              <Button type="button" variant="outline" className={cn(OUTLINE_BTN, 'min-h-12 px-[22px]')} onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="button" className="min-h-12 rounded-xl px-[22px] text-[15px]" disabled={review.isPending} loading={review.isPending} onClick={save}>
                {review.isPending ? 'Saving…' : 'Save review'}
              </Button>
            </div>
          </>
        ) : (
          shown &&
          shown.url !== null && (
            <div className="flex flex-col gap-1">
              <p className="text-[14px] font-semibold text-ink">Review</p>
              <p className="text-[14px] text-ink-muted">{decided}</p>
              <p className="text-[13px] text-ink-muted">Documents can only be reviewed while the booking waits for review.</p>
            </div>
          )
        )}
      </SheetContent>
    </Sheet>
  )
}
