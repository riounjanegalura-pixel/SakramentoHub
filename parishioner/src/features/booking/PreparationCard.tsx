import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, CircleDashed, Clock, Loader2, Upload } from 'lucide-react'
import { uploadDocument } from '../../lib/data/documents'
import { attachLateDocument } from '../../lib/data/bookings'
import { cn } from '../../lib/utils'
import type { Booking, Milestone } from '../../lib/types'
import { DocumentStateLine } from './DocumentStateLine'
import { documentState } from './documentState'

/** Checklist row to the document it is proven by (the four a wedding may add after submitting). */
const DOCUMENT_KEY: Record<string, string> = {
  pre_cana: 'preCanaCertificate',
  banns_completed: 'bannsCertificate',
  marriage_license: 'marriageLicense',
  confession: 'confessionCertificate',
}

const NEXT_STEP: Record<string, string> = {
  core_documents: 'Upload any missing documents and wait for the office to accept them.',
  canonical_interview: 'Call the parish office to set your interview with the priest.',
  mixed_marriage_permission: 'The parish office will help you apply for this permission.',
  pre_cana: 'Attend the Pre-Cana seminar, then upload your certificate here.',
  banns_completed: 'Upload the banns certificate once the three Sundays are done.',
  marriage_license: 'Bring your marriage license to the parish office. It is valid for 120 days from the day it was issued.',
}

const STATE_TEXT: Record<Milestone['state'], string> = { done: 'Done', due: 'Due soon', overdue: 'Overdue', upcoming: 'Coming up' }

function shortDate(ymd: string): string {
  return new Date(`${ymd}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function StateMark({ state }: { state: Milestone['state'] }) {
  const cls = 'flex shrink-0 items-center gap-1 text-label font-semibold'
  switch (state) {
    case 'done':
      return <span className={cn(cls, 'text-status-done-fg')}><CheckCircle2 size={14} aria-hidden="true" />{STATE_TEXT.done}</span>
    case 'overdue':
      return <span className={cn(cls, 'text-danger')}><AlertTriangle size={14} aria-hidden="true" />{STATE_TEXT.overdue}</span>
    case 'due':
      return <span className={cn(cls, 'text-status-pending-fg')}><Clock size={14} aria-hidden="true" />{STATE_TEXT.due}</span>
    default:
      return <span className={cn(cls, 'text-ink-muted')}><CircleDashed size={14} aria-hidden="true" />{STATE_TEXT.upcoming}</span>
  }
}

function doneDetail(m: Milestone): string | null {
  if (!m.done || !m.data) return null
  if ('art34' in m.data) return 'Art. 34 affidavit'
  return `License no. ${m.data.licenseNumber}, issued ${shortDate(m.data.issuedOn)} at ${m.data.issuedAt}`
}

interface RowProps {
  m: Milestone
  booking: Booking
  isNext: boolean
  canUpload: boolean
  onUpdated: (b: Booking) => void
}

function PreparationRow({ m, booking, isNext, canUpload, onUpdated }: RowProps) {
  const docKey = DOCUMENT_KEY[m.key]
  const doc = docKey ? (booking.documents ?? []).find((d) => d.key === docKey) : undefined
  const state = documentState(doc ?? { key: docKey ?? '', label: '', required: false, url: null, review: null })
  const attach = useMutation({
    mutationFn: async (file: File) => {
      const { url } = await uploadDocument(file)
      return attachLateDocument(booking.id, docKey, url)
    },
    onSuccess: (b) => onUpdated(b),
  })
  const busy = attach.isPending
  const detail = doneDetail(m)
  const showDocument = !!docKey && canUpload

  return (
    <li className={cn('rounded-lg p-3', isNext ? 'border border-status-pending-fg/40 bg-status-pending-bg' : 'border border-transparent')}>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <p className="min-w-[10ch] flex-1 text-body font-semibold text-ink">{m.label}</p>
        <StateMark state={m.state} />
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 text-label text-ink-muted">
        {isNext && <span className="font-semibold text-status-pending-fg">Next step</span>}
        {m.gating && <span>Required before the wedding</span>}
        {m.key === 'confession' && <span>Recommended</span>}
        {m.dueDate && !m.done && <span className={m.state === 'overdue' ? 'font-semibold text-danger' : undefined}>Due {shortDate(m.dueDate)}</span>}
      </div>
      {isNext && NEXT_STEP[m.key] && <p className="mt-1 text-body text-ink">{NEXT_STEP[m.key]}</p>}
      {detail && <p className="mt-1 text-body text-ink">{detail}</p>}
      {m.key === 'marriage_license' && !m.done && canUpload && (
        <p className="mt-1 text-sm text-ink-muted">The license is confirmed by the parish office. Uploading a copy does not complete this step.</p>
      )}
      {showDocument && (
        <div className="mt-2">
          <DocumentStateLine state={state} />
          <label
            className={cn(
              'mt-2 inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl border border-navy px-4 text-body font-semibold text-navy focus-within:ring-2 focus-within:ring-navy',
              busy && 'opacity-60',
            )}
          >
            {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Upload size={16} aria-hidden="true" />}
            <span>{busy ? 'Uploading…' : state.kind === 'missing' ? 'Upload' : 'Upload a new file'}</span>
            <input
              type="file"
              accept="image/*,.pdf"
              aria-label={`Upload a file for ${m.label}`}
              disabled={busy}
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (!file) return
                attach.mutate(file)
              }}
            />
          </label>
          {attach.isError && <p role="alert" className="mt-1 text-sm text-danger">{(attach.error as Error).message}</p>}
        </div>
      )}
    </li>
  )
}

/** A wedding's preparation checklist, as the server reports it (`booking.milestones`). */
/** A long checklist opens on the steps that matter now: the last finished one, the current one and the next few. */
const WINDOW = 4

export function PreparationCard({ booking, onUpdated, collapsible = false }: { booking: Booking; onUpdated: (b: Booking) => void; /** Open on the steps that matter now, with a button for the rest. */ collapsible?: boolean }) {
  const [showAll, setShowAll] = useState(false)
  const milestones = booking.milestones ?? []
  const visibleStatus = booking.status === 'submitted' || booking.status === 'approved' || booking.status === 'completed'
  if (milestones.length === 0 || !visibleStatus) return null

  const completed = booking.status === 'completed'
  const canUpload = booking.status === 'submitted' || booking.status === 'approved'
  const rows = milestones.filter((m) => m.key !== 'civil_registry' || completed)
  const approvedAt = milestones.findIndex((m) => m.key === 'approved')
  const counted = approvedAt >= 0 ? milestones.slice(0, approvedAt + 1) : milestones
  const doneCount = counted.filter((m) => m.done).length
  const next = completed ? undefined : rows.find((m) => m.gating && !m.done)
  const firstOpen = Math.max(0, rows.findIndex((m) => !m.done))
  const start = Math.min(Math.max(0, firstOpen - 1), Math.max(0, rows.length - WINDOW))
  const shown = !collapsible || showAll || rows.length <= WINDOW + 1 ? rows : rows.slice(start, start + WINDOW)

  return (
    <section aria-labelledby="preparation-heading" className="rounded-xl border border-line bg-surface p-4 text-sm">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 id="preparation-heading" className="font-semibold text-ink">Wedding preparation</h2>
        <p className="text-label text-ink-muted">{doneCount} of {counted.length} done</p>
      </div>
      <ul className="flex flex-col gap-1">
        {shown.map((m) => (
          <PreparationRow key={m.key} m={m} booking={booking} isNext={next?.key === m.key} canUpload={canUpload} onUpdated={onUpdated} />
        ))}
      </ul>
      {collapsible && rows.length > WINDOW + 1 && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          aria-expanded={showAll}
          className="mt-2 inline-flex min-h-11 items-center rounded-md text-sm font-semibold text-navy underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          {showAll ? 'Show fewer steps' : `Show all ${rows.length} steps`}
        </button>
      )}
    </section>
  )
}
