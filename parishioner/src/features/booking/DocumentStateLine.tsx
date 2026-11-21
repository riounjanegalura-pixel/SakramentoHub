import { CheckCircle2, Clock, FileQuestion, RefreshCw, XCircle } from 'lucide-react'
import type { DocumentState } from './documentState'

export function DocumentStateLine({ state }: { state: DocumentState }) {
  switch (state.kind) {
    case 'accepted':
      return (
        <p className="flex items-center gap-1.5 text-sm text-status-done-fg">
          <CheckCircle2 size={14} aria-hidden="true" /> Accepted
        </p>
      )
    case 'rejected':
      return (
        <div className="text-sm text-status-rejected-fg">
          <p className="flex items-center gap-1.5 font-semibold">
            <XCircle size={14} aria-hidden="true" /> Needs a new file
          </p>
          {state.note && <p className="mt-0.5 text-ink">Staff note: {state.note}</p>}
        </div>
      )
    case 'replaced':
      return (
        <p className="flex items-center gap-1.5 text-sm text-ink">
          <RefreshCw size={14} aria-hidden="true" /> New file ready — the parish office will check it again
        </p>
      )
    case 'waiting':
      return (
        <p className="flex items-center gap-1.5 text-sm text-ink-muted">
          <Clock size={14} aria-hidden="true" /> Waiting for review
        </p>
      )
    case 'missing':
      return (
        <p className="flex items-center gap-1.5 text-sm text-ink-muted">
          <FileQuestion size={14} aria-hidden="true" /> Not uploaded
        </p>
      )
  }
}
