import { CircleCheck, CircleX, type LucideIcon } from 'lucide-react'
import { cn } from '../../lib/utils'
import type { RegisterDetail, RegisterSource, RegisterStatus, TranscribableSacrament } from '../../lib/types'

/** The register each service is entered in (matches the server's register names). */
export const REGISTER_LABEL: Record<string, string> = {
  baptism: 'Baptism',
  confirmation: 'Confirmation',
  wedding: 'Marriage',
  funeral: 'Death',
  anointing: 'Anointing of the Sick',
  'house-blessing': 'Blessing',
}

export const REGISTER_OPTIONS = Object.keys(REGISTER_LABEL)

export const SOURCE_LABEL: Record<RegisterSource, string> = {
  system: 'From a booking',
  transcribed: 'Paper book',
}

export const TRANSCRIBE_OPTIONS: TranscribableSacrament[] = ['baptism', 'confirmation', 'wedding', 'funeral']

/** The detail rows a paper entry starts with, per register. Each row stays editable and removable. */
export const DEFAULT_DETAIL_LABELS: Record<TranscribableSacrament, string[]> = {
  baptism: ['Date of birth', 'Place of birth', 'Father', 'Mother', 'Sponsors'],
  confirmation: ['Date of birth', 'Father', 'Mother', 'Sponsor'],
  wedding: ['Groom', 'Bride', 'Witnesses'],
  funeral: ['Date of death', 'Age', 'Place of burial'],
}

const STATUS_LABEL: Record<RegisterStatus, string> = { valid: 'Valid', revoked: 'Revoked' }
const STATUS_STYLE: Record<RegisterStatus, string> = {
  valid: 'bg-status-done-bg text-status-done-fg',
  revoked: 'bg-status-rejected-bg text-status-rejected-fg',
}
const STATUS_ICON: Record<RegisterStatus, LucideIcon> = { valid: CircleCheck, revoked: CircleX }

/** Valid or Revoked as a pill with an icon and a word, so colour is never the only signal. */
export function RegisterStatusBadge({ status, className }: { status: RegisterStatus; className?: string }) {
  const Icon = STATUS_ICON[status]
  return (
    <span className={cn('inline-flex h-[26px] items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[13px] font-medium', STATUS_STYLE[status], className)}>
      <Icon size={14} aria-hidden="true" />
      {STATUS_LABEL[status]}
    </span>
  )
}

export interface DetailGroup {
  title: string
  rows: RegisterDetail[]
}

/** What the person is called in their own group of details, by register. */
const PERSON_TITLE: Record<string, string> = { Baptism: 'Child', Death: 'Deceased', Confirmation: 'Confirmand' }

/**
 * Sorts the flat detail rows of a certificate into the groups staff think in: the person, then each parent,
 * the couple, and the sponsors or witnesses, parents and couple each in one group. Empty groups are left out, and rows keep their order inside a group.
 */
export function groupDetails(register: string, details: RegisterDetail[]): DetailGroup[] {
  const order: string[] = [PERSON_TITLE[register] ?? 'Details', 'Parents', 'Couple', 'Sponsors and witnesses']
  const buckets = new Map<string, RegisterDetail[]>(order.map((t) => [t, []]))
  for (const d of details) {
    const label = d.label.toLowerCase()
    let key = order[0]
    if (/father|mother|parent/.test(label)) key = 'Parents'
    else if (/groom|bride|spouse/.test(label)) key = 'Couple'
    else if (/sponsor|godparent|godfather|godmother|witness/.test(label)) key = 'Sponsors and witnesses'
    buckets.get(key)!.push(d)
  }
  return order.map((title) => ({ title, rows: buckets.get(title)! })).filter((g) => g.rows.length > 0)
}

/** Limits from the server's validation rules. */
export const LIMITS = { subjectName: 160, minister: 120, detailLabel: 60, detailValue: 200, details: 12, paper: 20, reason: 500 }
