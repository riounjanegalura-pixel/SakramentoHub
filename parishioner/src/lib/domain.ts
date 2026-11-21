import type { Booking, BookingStatus, ParishEventCategory, PaymentStatus, Sacrament } from './types'

export const SACRAMENT_LABEL: Record<Sacrament, string> = {
  baptism: 'Baptism',
  wedding: 'Wedding',
  confirmation: 'Confirmation',
  funeral: 'Funeral Mass',
  anointing: 'Anointing of the Sick',
  'house-blessing': 'House Blessing & Other',
}

export const SACRAMENTS = Object.keys(SACRAMENT_LABEL) as Sacrament[]

export const STATUS_LABEL: Record<BookingStatus, string> = {
  draft: 'Draft',
  submitted: 'Awaiting review',
  returned: 'Needs changes',
  approved: 'Approved',
  completed: 'Completed',
  declined: 'Declined',
  cancelled: 'Cancelled',
}

/** Pill colours from DESIGN.md's status vocabulary. */
export const STATUS_STYLE: Record<BookingStatus, string> = {
  draft: 'bg-paper text-ink-muted border-current border-dashed',
  submitted: 'bg-status-pending-bg text-status-pending-fg border-current',
  // Needs changes reads as a stop sign, not a wait: the same red as Declined, told apart by its icon and its words.
  returned: 'bg-status-rejected-bg text-status-rejected-fg border-current',
  approved: 'bg-status-confirmed-bg text-status-confirmed-fg border-current',
  completed: 'bg-status-done-bg text-status-done-fg border-current',
  declined: 'bg-status-rejected-bg text-status-rejected-fg border-current',
  cancelled: 'bg-paper text-ink-muted border-current',
}

export const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  not_required: 'No fee',
  unpaid: 'Unpaid',
  pending_cash: 'Cash at the parish office',
  paid: 'Paid',
  refund_due: 'Refund due',
  refunded: 'Refunded',
  void: 'Void',
}

export const EVENT_CATEGORY_LABEL: Record<ParishEventCategory, string> = {
  mass: 'Mass',
  feast: 'Feast day',
  seminar: 'Seminar',
  fundraiser: 'Fundraiser',
  community: 'Community',
  notice: 'Notice',
  general: 'Parish event',
  other: 'Other',
  baptism: 'Baptism',
  wedding: 'Wedding',
  confirmation: 'Confirmation',
  funeral: 'Funeral',
  anointing: 'Anointing',
  'house-blessing': 'Blessing',
}

/** A category's readable label; a value that is not in the list is shown as it is stored. */
export function eventCategoryLabel(category: string): string {
  return (EVENT_CATEGORY_LABEL as Record<string, string>)[category] ?? category
}

export const RELIGIONS = [
  'Roman Catholic',
  'Aglipayan',
  'Iglesia ni Cristo',
  'Protestant',
  'Born Again Christian',
  'Baptist',
  'Methodist',
  'Seventh-day Adventist',
  "Jehovah's Witnesses",
  'Members Church of God International',
  'Church of Jesus Christ of Latter-day Saints',
  'Other Christian',
  'Islam',
  'Buddhism',
  'Hinduism',
  'Other',
  'None',
] as const

/** Baptism and wedding are for Catholics only: the forms offer no other religion. */
export const CATHOLIC = 'Roman Catholic'
export const CATHOLIC_ONLY = [CATHOLIC] as const

/** Suffix choices; men only. "N/A" is the blank choice and stores nothing. */
export const SUFFIXES = ['Jr.', 'Sr.', 'III'] as const

/** Why a parent's details are left out (baptism), so nobody has to think of wording. */
export const OMIT_REASONS = [
  'Estranged / uncontactable',
  'Sole custody by mother',
  'Sole custody by father',
  'No legal relationship',
  'Other / personal reasons',
] as const

/** Wedding motif choices; a motif is always required (N/A and "to be determined" are allowed). */
export const MOTIFS = [
  'N/A',
  'None',
  'To be determined',
  'Classic White',
  'White and Gold',
  'Navy Blue and Blush Pink',
  'Emerald Green and Gold',
  'Dusty Blue and Silver',
  'Pastel / Neutral Colors',
  'Simple church decoration only',
  'Will confirm color motif once finalized',
  'Standard church setup requested',
] as const

export const RELATIONSHIPS = [
  { value: 'child', label: 'My child' },
  { value: 'parent', label: 'My parent' },
  { value: 'spouse', label: 'My spouse' },
  { value: 'sibling', label: 'My sibling' },
  { value: 'relative', label: 'A relative' },
  { value: 'other', label: 'Someone else' },
] as const

export const CIVIL_STATUS_LABEL: Record<string, string> = {
  single: 'Single',
  married: 'Married',
  widowed: 'Widowed',
  annulled: 'Annulled',
  separated: 'Legally separated',
}

const PESO = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' })

export function peso(centavos: number): string {
  return PESO.format(centavos / 100)
}

export function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const suffix = h >= 12 ? 'PM' : 'AM'
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${suffix}`
}

/** The time a slot ends, from its start and length: "10:00" + 45 minutes = "10:45". */
export function addMinutesToTime(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(':').map(Number)
  const total = (h * 60 + m + minutes) % (24 * 60)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

/** Parses YYYY-MM-DD as a local calendar day (no UTC shift). */
export function formatDate(ymd: string): string {
  return new Date(`${ymd}T00:00:00`).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  })
}

export function parishToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

/** An ISO instant (e.g. paidAt) shown in parish time, whatever the device's time zone. */
export function formatInstant(iso: string): string {
  return new Date(iso).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' })
}

/** True once an unpaid booking's payment hold has run out; the server then releases the slot. */
export function paymentHoldExpired(b: Pick<Booking, 'paymentHoldExpiresAt'>): boolean {
  return b.paymentHoldExpiresAt !== null && Date.parse(b.paymentHoldExpiresAt) <= Date.now()
}

/** Money still owed while the slot is held on a deadline: GCash not yet paid, or cash promised at the parish office. */
export function awaitingPayment(status: PaymentStatus | null): boolean {
  return status === 'unpaid' || status === 'pending_cash'
}

/** A submitted booking nobody paid for in time: the server releases its slot, so it reads as lapsed. */
export function holdLapsed(b: Pick<Booking, 'status' | 'paymentStatus' | 'paymentHoldExpiresAt'>): boolean {
  return (b.status === 'submitted' || b.status === 'approved') && awaitingPayment(b.paymentStatus) && paymentHoldExpired(b)
}

export const HOLD_EXPIRED_NOTE = 'Payment window closed — this booking will be cancelled.'

export function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00`)
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** An approved booking can be cancelled or moved online until this many days before its date. */
export const CHANGE_CUTOFF_DAYS = 3

export function pastChangeCutoff(b: Pick<Booking, 'status' | 'appointmentDate'>): boolean {
  return b.status === 'approved' && !!b.appointmentDate && addDaysYmd(parishToday(), CHANGE_CUTOFF_DAYS) > b.appointmentDate
}

/** What a parishioner must do next on a booking, or null. A lapsed payment hold is not an action: the slot is already gone. */
export function needsAction(b: Booking): string | null {
  if (b.status === 'returned') return 'The parish asked for changes'
  const payOpen = (b.status === 'submitted' || b.status === 'approved') && !paymentHoldExpired(b) && b.canPayNow !== false
  if (payOpen && b.paymentStatus === 'unpaid') return b.status === 'approved' ? 'Approved: pay to keep your slot' : 'Pay with GCash to keep your slot'
  if (payOpen && b.paymentStatus === 'pending_cash') return 'Pay at the parish office to keep your slot'
  return null
}
