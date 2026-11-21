import { useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { FileText, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { attachLateDocument } from '../../lib/data/bookings'
import { uploadDocument } from '../../lib/data/documents'
import type { AdminBooking, BookingDocument } from '../../lib/types'
import { cn } from '../../lib/utils'
import { docMeta, docState } from './bookingModel'
import { DocumentDrawer } from './DocumentDrawer'
import { CARD, FieldError, H2, OUTLINE_BTN, Pill } from './parts'

/** The documents a wedding collects after approval; staff review them, and add them for walk-ins, up to completion. */
const LATE_KEYS = ['marriageLicense', 'preCanaCertificate', 'bannsCertificate', 'confessionCertificate']

/** Whether staff may accept or reject this file now: while the booking waits for review, or a wedding's late papers once approved. */
export function canReviewDocument(booking: AdminBooking, doc: BookingDocument): boolean {
  const isLate = booking.sacrament === 'wedding' && LATE_KEYS.includes(doc.key)
  return doc.url !== null && (booking.status === 'submitted' || (booking.status === 'approved' && isLate))
}

function DocumentRow({
  booking,
  doc,
  onChanged,
  onOpen,
}: {
  booking: AdminBooking
  doc: BookingDocument
  onChanged: (b: AdminBooking) => void
  onOpen: (key: string, trigger: HTMLElement) => void
}) {
  const isLate = booking.sacrament === 'wedding' && LATE_KEYS.includes(doc.key)
  const canAttach = isLate && booking.channel === 'walk_in' && (booking.status === 'submitted' || booking.status === 'approved')
  const attach = useMutation({
    mutationFn: async (file: File) => {
      const { url } = await uploadDocument(file)
      return attachLateDocument(booking.id, doc.key, url)
    },
    onSuccess: (updated) => onChanged(updated),
  })
  const state = docState(doc)
  const attachLabel = `${doc.url ? 'Replace' : 'Add'} file for ${doc.label}`
  const reviewable = canReviewDocument(booking, doc)
  const action = doc.review === null && reviewable ? 'Review' : 'View'

  return (
    <li aria-label={doc.label} className="border-b border-line px-6 py-2.5 last:border-b-0">
      <div className="flex min-h-[44px] flex-wrap items-center gap-x-3.5 gap-y-2">
        <FileText size={22} strokeWidth={1.8} aria-hidden="true" className="shrink-0 text-navy" />
        <span className="min-w-0 flex-[1_1_220px]">
          <span className="block text-[15px] font-medium">{doc.label}</span>
          <span className="block text-[13px] text-ink-muted">{docMeta(doc)}</span>
          {doc.review?.status === 'rejected' && doc.review.note && <span className="block text-[13px] text-status-rejected-fg">Rejected: {doc.review.note}</span>}
        </span>
        <Pill tone={state.tone} icon={state.icon}>{state.label}</Pill>
        {doc.url !== null && (
          <Button
            type="button"
            variant="outline"
            aria-label={`${action} ${doc.label}`}
            className={cn(OUTLINE_BTN, 'min-h-11 min-w-[92px] rounded-[10px] px-3.5 text-[14px] lg:min-h-[38px]')}
            onClick={(e) => onOpen(doc.key, e.currentTarget)}
          >
            {action}
          </Button>
        )}
        {canAttach && (
          <label
            className={cn(
              'inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-[10px] border border-input-border bg-surface px-3.5 text-[14px] font-semibold text-navy focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus lg:min-h-[38px]',
              attach.isPending ? 'cursor-wait opacity-60' : 'hover:bg-paper',
            )}
          >
            <Upload size={14} aria-hidden="true" />
            <span aria-hidden="true">{attach.isPending ? 'Uploading…' : doc.url ? 'Replace file' : 'Add file'}</span>
            <input
              type="file"
              accept=".jpg,.jpeg,.png,.pdf"
              aria-label={attachLabel}
              disabled={attach.isPending}
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (file) attach.mutate(file)
              }}
            />
          </label>
        )}
      </div>
      {/* The upload state in words for screen readers; the control itself shows "Uploading…" while it runs. */}
      {canAttach && <p role="status" className="sr-only">{attach.isPending ? `Uploading the file for ${doc.label}…` : ''}</p>}
      {attach.isError && <FieldError>{(attach.error as Error).message}</FieldError>}
    </li>
  )
}

/** The per-document list (spec §3.2). Approving is blocked until every uploaded file here is accepted. */
export function DocumentsCard({ booking, onChanged }: { booking: AdminBooking; onChanged: (b: AdminBooking) => void }) {
  const [openKey, setOpenKey] = useState<string | null>(null)
  // The drawer has no Radix trigger, so focus goes back to the button that opened it.
  const opener = useRef<HTMLElement | null>(null)
  if (booking.documents.length === 0) return null
  const openDoc = booking.documents.find((d) => d.key === openKey) ?? null

  return (
    <section id="documents" aria-label="Documents" className={cn(CARD, 'scroll-mt-20')}>
      <div className="px-6 pb-3 pt-[18px]">
        <h2 className={H2}>Documents</h2>
        {booking.sacrament === 'wedding' && booking.channel === 'walk_in' && (
          <p className="mt-1 text-[14px] text-ink-muted">Walk-in wedding: add the paper copy here, or confirm each step with a note when it is shown at the office.</p>
        )}
      </div>
      <ul className="border-t border-line">
        {booking.documents.map((doc) => (
          <DocumentRow key={doc.key} booking={booking} doc={doc} onChanged={onChanged} onOpen={(key, trigger) => {
              opener.current = trigger
              setOpenKey(key)
            }} />
        ))}
      </ul>
      <DocumentDrawer
        booking={booking}
        doc={openDoc}
        canReview={openDoc ? canReviewDocument(booking, openDoc) : false}
        open={openDoc !== null}
        onOpenChange={(o) => {
          if (!o) setOpenKey(null)
        }}
        onChanged={onChanged}
        onCloseAutoFocus={(e) => {
          e.preventDefault()
          opener.current?.focus()
        }}
      />
    </section>
  )
}
