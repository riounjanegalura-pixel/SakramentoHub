import { CircleAlert, CircleCheck, CircleX, Clock, type LucideIcon } from 'lucide-react'
import { cn } from '../../lib/utils'
import type { AdminCertificateRequest, CertificateRequestStatus } from '../../lib/types'

export const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus'
export const CARD = 'rounded-2xl border border-line bg-surface'

export const REQUEST_STATUS_LABEL: Record<CertificateRequestStatus, string> = {
  submitted: 'Waiting',
  issued: 'Issued',
  declined: 'Declined',
  cancelled: 'Cancelled',
}

const REQUEST_STATUS_STYLE: Record<CertificateRequestStatus, string> = {
  submitted: 'bg-status-pending-bg text-status-pending-fg',
  issued: 'bg-status-done-bg text-status-done-fg',
  declined: 'bg-status-rejected-bg text-danger',
  cancelled: 'bg-paper-deep text-ink-muted',
}

const REQUEST_STATUS_ICON: Record<CertificateRequestStatus, LucideIcon> = {
  submitted: Clock,
  issued: CircleCheck,
  declined: CircleAlert,
  cancelled: CircleX,
}

/** A pill with an icon and a word, so colour is never the only signal. */
export function RequestStatusBadge({ status, className }: { status: CertificateRequestStatus; className?: string }) {
  const Icon = REQUEST_STATUS_ICON[status]
  return (
    <span className={cn('inline-flex h-[26px] items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[13px] font-medium', REQUEST_STATUS_STYLE[status], className)}>
      <Icon size={14} aria-hidden="true" />
      {REQUEST_STATUS_LABEL[status]}
    </span>
  )
}

export const RELATIONSHIP_LABEL: Record<AdminCertificateRequest['relationship'], string> = {
  self: 'Self',
  parent: 'Parent',
  child: 'Child',
  spouse: 'Spouse',
  sibling: 'Sibling',
  representative: 'Representative',
}

/** Suggested decline reasons; they fill the remarks and stay editable. */
export const INVALID_ID_REMARK =
  "Invalid document uploaded. Please re-upload a clear copy of a valid government-issued ID (e.g., UMID, Driver's License, Passport, PhilID) matching the requester's name."
