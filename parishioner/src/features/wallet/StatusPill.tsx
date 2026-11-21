import { BadgeCheck, Ban, CircleAlert, Clock, type LucideIcon } from 'lucide-react'
import { Badge } from '../../components/ui/badge'
import type { CertificateRequestStatus } from '../../lib/types'

type Tone = 'waiting' | 'done' | 'refused' | 'neutral'

// One status token pair per tone; the icon and the words carry the meaning, so colour is never the only signal.
const TONE: Record<Tone, string> = {
  waiting: 'bg-status-pending-bg text-status-pending-fg',
  done: 'bg-status-done-bg text-status-done-fg',
  refused: 'bg-status-rejected-bg text-status-rejected-fg',
  neutral: 'bg-paper text-ink-muted border-line',
}

const REQUEST: Record<CertificateRequestStatus, { label: string; tone: Tone; icon: LucideIcon }> = {
  submitted: { label: 'Submitted', tone: 'waiting', icon: Clock },
  issued: { label: 'Issued', tone: 'done', icon: BadgeCheck },
  declined: { label: 'Declined', tone: 'refused', icon: CircleAlert },
  cancelled: { label: 'Cancelled', tone: 'neutral', icon: Ban },
}

function Pill({ label, tone, icon: Icon }: { label: string; tone: Tone; icon: LucideIcon }) {
  return (
    <Badge className={`shrink-0 gap-1 px-2.5 py-0.5 ${TONE[tone]}`}>
      <Icon aria-hidden="true" />
      {label}
    </Badge>
  )
}

/** The state of a certificate copy request. */
export function RequestStatusPill({ status }: { status: CertificateRequestStatus }) {
  return <Pill {...REQUEST[status]} />
}

/** The state of a certificate in the register: valid, or withdrawn by the parish office. */
export function EntryStatusPill({ revoked }: { revoked: boolean }) {
  return revoked ? <Pill label="Withdrawn" tone="refused" icon={Ban} /> : <Pill label="Valid" tone="done" icon={BadgeCheck} />
}
