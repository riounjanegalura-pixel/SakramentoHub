import type { AdminBooking, BookingStatus, ParishEventCategory, PaymentStatus } from './types'

export const STATUS_LABEL: Record<BookingStatus, string> = {
  draft: 'Draft',
  submitted: 'Awaiting review',
  returned: 'Needs changes',
  approved: 'Approved',
  completed: 'Completed',
  declined: 'Declined',
  cancelled: 'Cancelled',
}

export const STATUS_STYLE: Record<BookingStatus, string> = {
  draft: 'bg-paper text-ink-muted border-line',
  submitted: 'bg-status-pending-bg text-status-pending-fg',
  returned: 'bg-status-pending-bg text-status-pending-fg ring-1 ring-inset ring-status-pending-fg/40',
  approved: 'bg-status-confirmed-bg text-status-confirmed-fg',
  completed: 'bg-status-done-bg text-status-done-fg',
  declined: 'bg-status-rejected-bg text-status-rejected-fg',
  cancelled: 'bg-paper text-ink-muted border-line',
}

export const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  not_required: 'No fee',
  unpaid: 'Unpaid',
  pending_cash: 'Cash pending',
  paid: 'Paid',
  refund_due: 'Refund due',
  refunded: 'Refunded',
  void: 'Void',
}

const PESO = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' })
export const peso = (centavos: number) => PESO.format(centavos / 100)

export function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

export function formatDate(ymd: string): string {
  return new Date(`${ymd}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

/** An ISO timestamp (e.g. createdAt) as a parish-local calendar date: "Jan 8, 2030". */
export function formatManilaDate(iso: string, withYear = true): string {
  return new Date(iso).toLocaleDateString('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    ...(withYear ? { year: 'numeric' } : {}),
  })
}

export function parishToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

/** "childPlaceOfBirth" → "Child place of birth". */
export function humanizeKey(key: string): string {
  const words = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** An ISO timestamp as parish-local date and time: "Nov 2, 2026, 8:00 AM". */
export function formatManilaDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' })
}

/** An ISO timestamp as parish-local date and a 24-hour time: "Nov 15, 2026, 22:45". */
export function formatManilaDateTime24(iso: string): string {
  return new Date(iso).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  })
}

/** When the booking is: the appointment, "Urgent — no slot" for an emergency anointing, or a dash. */
export function appointmentText(b: Pick<AdminBooking, 'isEmergency' | 'appointmentDate' | 'appointmentStart'>): string {
  if (b.isEmergency) return 'Urgent — no slot'
  if (b.appointmentDate && b.appointmentStart) return `${formatDate(b.appointmentDate)} · ${formatTime(b.appointmentStart)}`
  return '—'
}

/** The payment hold has a time and it has passed. A copy of the parishioner app's helper (the apps share no code). */
export function paymentHoldExpired(b: Pick<AdminBooking, 'paymentHoldExpiresAt'>): boolean {
  return b.paymentHoldExpiresAt !== null && Date.parse(b.paymentHoldExpiresAt) <= Date.now()
}

/** Money still owed while the slot is held on a deadline: GCash not yet paid, or cash promised at the parish office. */
export function awaitingPayment(status: PaymentStatus | null): boolean {
  return status === 'unpaid' || status === 'pending_cash'
}

/** A submitted booking nobody paid for in time: the server releases its slot, so it reads as lapsed. */
export function holdLapsed(b: Pick<AdminBooking, 'status' | 'paymentStatus' | 'paymentHoldExpiresAt'>): boolean {
  return b.status === 'submitted' && awaitingPayment(b.paymentStatus) && paymentHoldExpired(b)
}

/** An ISO timestamp as a parish-local time of day: "2:05 PM". */
export function formatManilaTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' })
}

/** The categories a parish event can be filed under. Mirrors the backend's config('parish_events.categories'), which validates it. */
export const EVENT_CATEGORIES: { value: ParishEventCategory; label: string }[] = [
  { value: 'mass', label: 'Mass' },
  { value: 'feast', label: 'Feast day' },
  { value: 'seminar', label: 'Seminar' },
  { value: 'fundraiser', label: 'Fundraiser' },
  { value: 'community', label: 'Community' },
  { value: 'notice', label: 'Notice' },
  { value: 'general', label: 'Parish event' },
  { value: 'other', label: 'Other' },
]

/** A category's readable label; a legacy value that is not in the list is shown as it is stored. */
export function eventCategoryLabel(category: string): string {
  return EVENT_CATEGORIES.find((c) => c.value === category)?.label ?? category
}
