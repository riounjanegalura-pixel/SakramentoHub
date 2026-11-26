import { MOCK_PARISH_PHONE } from './parish'
import { simulateLatency, simulateFailure, getFailureRate } from './latency'
import { SERVICES } from './services'
import { mockDayStatus, endTime, holdsReturnedSlot } from './availability'
import { readBookings, writeBookings } from './booking-storage'
import { STATUS_LABEL, addDaysYmd, parishToday, pastChangeCutoff } from '../domain'
import type { Booking, BookingDocument, BookingStatus, DraftInput, DraftPatch, Milestone, PaymentQr, Sacrament, ScheduleContext, SimulatedCodeSent } from '../types'

const VERIFY_MESSAGE =
  'Please verify your email address before submitting a booking. You can resend the verification email from the banner on your Home screen.'

async function guard(message: string): Promise<void> {
  await simulateLatency()
  if (simulateFailure(getFailureRate())) throw new Error(message)
}

export function amountDue(sacrament: Sacrament, formData: Record<string, unknown>): number {
  const service = SERVICES.find((s) => s.id === sacrament)
  if (!service || service.priceCentavos === null) return 0
  if (service.feeRule === 'per_sponsor') {
    return service.priceCentavos * (Array.isArray(formData.sponsors) ? formData.sponsors.length : 0)
  }
  return service.feeRule === 'flat' ? service.priceCentavos : 0
}

function find(id: string): Booking {
  const found = readBookings().find((b) => b.id === id)
  if (!found) throw new Error(`Booking ${id} not found`)
  return found
}

function save(booking: Booking): Booking {
  const all = readBookings()
  const i = all.findIndex((b) => b.id === booking.id)
  if (i === -1) all.push(booking)
  else all[i] = booking
  writeBookings(all)
  return booking
}

function withStatus(b: Booking, status: BookingStatus): Booking {
  return { ...b, status, statusLabel: STATUS_LABEL[status] }
}

function context(b: Booking): ScheduleContext {
  return {
    scheduleType: b.formData.scheduleType as ScheduleContext['scheduleType'],
    massType: b.formData.massType as ScheduleContext['massType'],
  }
}

export async function saveDraft(input: DraftInput): Promise<Booking> {
  await guard('Failed to save booking')
  const existing = readBookings().find((b) => b.userId === input.userId && b.sacrament === input.sacrament && b.status === 'draft')
  const base: Booking = existing ?? {
    id: crypto.randomUUID(),
    referenceNumber: `${input.sacrament.replace(/[^a-z]/gi, '').slice(0, 4).toUpperCase()}-${parishToday().replaceAll('-', '')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    userId: input.userId,
    sacrament: input.sacrament,
    status: 'draft',
    statusLabel: STATUS_LABEL.draft,
    formData: {},
    appointmentDate: null,
    appointmentStart: null,
    appointmentEnd: null,
    isEmergency: false,
    paymentStatus: null,
    amountDueCentavos: 0,
    paymentHoldExpiresAt: null,
    paidAt: null,
    paymentReference: null,
    refundReference: null,
    refundedAt: null,
    statusReason: null,
    returnNote: null,
    createdAt: new Date().toISOString(),
  }

  return save({
    ...base,
    formData: input.formData,
    appointmentDate: input.appointmentDate ?? null,
    appointmentStart: input.appointmentStart ?? null,
    amountDueCentavos: amountDue(input.sacrament, input.formData),
  })
}

export async function updateDraft(id: string, patch: DraftPatch): Promise<Booking> {
  await guard(`Failed to update booking ${id}`)
  const b = find(id)
  if (b.status !== 'draft' && b.status !== 'returned') throw new Error('Only a draft or a returned booking can be edited.')
  const formData = patch.formData ?? b.formData
  const returnedSlot =
    b.status === 'returned' && !b.returnedSlot && b.appointmentDate && b.appointmentStart
      ? { date: b.appointmentDate, start: b.appointmentStart }
      : b.returnedSlot
  return save({
    ...b,
    formData,
    returnedSlot,
    appointmentDate: patch.appointmentDate !== undefined ? patch.appointmentDate : b.appointmentDate,
    appointmentStart: patch.appointmentStart !== undefined ? patch.appointmentStart : b.appointmentStart,
    amountDueCentavos: amountDue(b.sacrament, formData),
  })
}

export async function submitBooking(id: string): Promise<Booking> {
  await guard(`Failed to submit booking ${id}`)
  const rawUser = localStorage.getItem('sakramentohub_mock_current_user')
  const user = rawUser ? JSON.parse(rawUser) : null
  if (user && !user.emailVerifiedAt) throw new Error(VERIFY_MESSAGE)

  const b = find(id)
  if (b.status !== 'draft' && b.status !== 'returned') throw new Error("This booking can't be submitted from its current state.")

  const emergency = b.sacrament === 'anointing' && b.formData.inDangerOfDeath === true
  let appointmentEnd: string | null = null
  if (!emergency) {
    if (!b.appointmentDate || !b.appointmentStart) throw new Error('Choose an appointment date and time.')
    const day = mockDayStatus(b.sacrament, b.appointmentDate, context(b), b.id, !holdsReturnedSlot(b))
    if (day.status === 'unavailable') throw new Error(day.reason ?? 'That date is not available.')
    if (!day.freeStarts.includes(b.appointmentStart)) throw new Error('That time is no longer available. Please choose another.')
    appointmentEnd = endTime(b.sacrament, b.appointmentStart, context(b))
  }

  const amount = amountDue(b.sacrament, b.formData)
  const paid = b.paymentStatus === 'paid'
  return save({
    ...withStatus(b, 'submitted'),
    isEmergency: emergency,
    appointmentDate: emergency ? null : b.appointmentDate,
    appointmentStart: emergency ? null : b.appointmentStart,
    appointmentEnd,
    amountDueCentavos: amount,
    paymentStatus: paid ? 'paid' : amount > 0 ? (b.paymentStatus === 'pending_cash' ? 'pending_cash' : 'unpaid') : 'not_required',
    paymentHoldExpiresAt: amount > 0 && !paid ? new Date(Date.now() + 48 * 3600 * 1000).toISOString() : null,
  })
}

export async function cancelBooking(id: string, reason: string): Promise<Booking> {
  await guard(`Failed to cancel booking ${id}`)
  const b = find(id)
  if (!['draft', 'submitted', 'returned', 'approved'].includes(b.status)) throw new Error("This booking can't be cancelled from its current state.")
  if (pastChangeCutoff(b)) {
    throw new Error(`Approved bookings can only be cancelled online until 3 days before the appointment. Please call the parish office at ${MOCK_PARISH_PHONE}.`)
  }
  const paymentStatus = b.paymentStatus === 'paid' ? 'refund_due' : b.paymentStatus === 'unpaid' || b.paymentStatus === 'pending_cash' ? 'void' : b.paymentStatus
  return save({ ...withStatus(b, 'cancelled'), paymentStatus, statusReason: reason, paymentHoldExpiresAt: null })
}

export async function rescheduleBooking(id: string, appointmentDate: string, appointmentStart: string): Promise<Booking> {
  await guard(`Failed to reschedule booking ${id}`)
  const b = find(id)
  if (b.status !== 'submitted' && b.status !== 'approved') throw new Error('Only a submitted or approved booking can be rescheduled.')
  if (pastChangeCutoff(b)) {
    throw new Error(`Approved bookings can only be rescheduled online until 3 days before the appointment. Please call the parish office at ${MOCK_PARISH_PHONE}.`)
  }
  const day = mockDayStatus(b.sacrament, appointmentDate, context(b), b.id)
  if (day.status === 'unavailable') throw new Error(day.reason ?? 'That date is not available.')
  if (!day.freeStarts.includes(appointmentStart)) throw new Error('That time is no longer available. Please choose another.')
  return save({
    ...withStatus(b, 'submitted'),
    appointmentDate,
    appointmentStart,
    appointmentEnd: endTime(b.sacrament, appointmentStart, context(b)),
  })
}

/** The four documents a wedding may add after it is submitted, keyed like the server's checklist. */
const LATE_DOCUMENTS: Record<string, string> = {
  marriageLicense: 'marriage license or Art. 34 affidavit',
  preCanaCertificate: 'Pre-Cana seminar certificate',
  bannsCertificate: 'banns certificate',
  confessionCertificate: 'confession certificate',
}

/** [key, label, days before the wedding, gating, document key that proves it] in the server's order. */
const WEDDING_STEPS: [string, string, number | null, boolean][] = [
  ['submitted', 'Booking submitted', null, false],
  ['paid', 'Fee paid', null, false],
  ['core_documents', 'Core documents accepted', null, true],
  ['canonical_interview', 'Canonical interview', 60, true],
  ['banns_requested', 'Banns requested', 45, false],
  ['mixed_marriage_permission', 'Permission for a mixed marriage', 30, true],
  ['pre_cana', 'Pre-Cana seminar', 30, true],
  ['banns_completed', 'Banns completed or dispensed', 14, true],
  ['marriage_license', 'Marriage license or Art. 34 affidavit', 14, true],
  ['confession', 'Confession', 3, false],
  ['approved', 'Booking approved', null, false],
  ['wedding_day', 'Wedding day', null, false],
  ['civil_registry', 'Marriage certificate sent to the Local Civil Registrar', -15, false],
]

const isCatholic = (v: unknown) => typeof v !== 'string' || v.trim() === '' || /^(roman\s*)?catholic$/i.test(v.trim().replace(/\s+/g, ' '))

/** The mock has no office, so nothing is ticked by hand; the computed steps follow the booking's own state. */
function weddingMilestones(b: Booking): Milestone[] {
  const today = parishToday()
  const mixed = !isCatholic(b.formData.groomReligion) || !isCatholic(b.formData.brideReligion)
  const doneBy: Record<string, boolean> = {
    submitted: b.status !== 'draft',
    paid: b.paymentStatus === 'paid' || b.paymentStatus === 'not_required',
    approved: b.status === 'approved' || b.status === 'completed',
    wedding_day: b.status === 'completed',
  }
  return WEDDING_STEPS.filter(([key]) => key !== 'mixed_marriage_permission' || mixed).map(([key, label, days, gating]) => {
    const done = doneBy[key] ?? false
    const dueDate = days !== null && b.appointmentDate ? addDaysYmd(b.appointmentDate, -days) : null
    const state: Milestone['state'] = done
      ? 'done'
      : dueDate === null ? 'upcoming'
      : dueDate < today ? 'overdue'
      : dueDate <= addDaysYmd(today, 7) ? 'due'
      : 'upcoming'
    return { key, label, done, state, source: done ? 'auto' : null, dueDate, gating, manual: days !== null, doneAt: null, data: null }
  })
}

const PLACEHOLDER_QR = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 21 21" shape-rendering="crispEdges"><rect width="21" height="21" fill="#fff"/><path d="M1 1h7v7H1zM13 1h7v7h-7zM1 13h7v7H1zM10 10h2v2h-2zM14 14h5v5h-5z" fill="#000"/></svg>'

/** What the server adds to a booking on every read: the wedding checklist, the day pass and the check-in time. */
function withDerived(b: Booking): Booking {
  const wedding = b.sacrament === 'wedding'
  const documents: BookingDocument[] | undefined = wedding
    ? [
        ...(b.documents ?? []).filter((d) => !(d.key in LATE_DOCUMENTS)),
        ...Object.entries(LATE_DOCUMENTS)
          .filter(([key]) => typeof b.formData[key] === 'string' && b.formData[key] !== '')
          .map(([key, label]) => ({ key, label, required: false, url: b.formData[key] as string, review: null })),
      ]
    : b.documents
  return {
    ...b,
    documents,
    milestones: wedding ? weddingMilestones(b) : [],
    checkedInAt: b.checkedInAt ?? null,
    dayPass: b.status === 'approved'
      && b.appointmentDate
      && (b.paymentStatus === 'paid' || b.paymentStatus === 'not_required')
      ? { url: `https://office.example/check-in/${b.referenceNumber}`, qrSvg: PLACEHOLDER_QR }
      : null,
  }
}

export async function fetchBookings(userId: string): Promise<Booking[]> {
  await guard('Failed to fetch bookings')
  // A list carries the pass's url but never the QR, as on the server.
  return readBookings().filter((b) => b.userId === userId).map((b) => {
    const d = withDerived(b)
    return { ...d, dayPass: d.dayPass ? { url: d.dayPass.url } : null }
  })
}

export async function fetchBooking(id: string): Promise<Booking> {
  await guard(`Failed to fetch booking ${id}`)
  return withDerived(find(id))
}

/** Stores a wedding's late document the way the server does: only while submitted or approved, status unchanged. */
export async function attachLateDocument(bookingId: string, key: string, fileUrl: string): Promise<Booking> {
  await guard(`Failed to add the document to booking ${bookingId}`)
  const b = find(bookingId)
  if (b.sacrament !== 'wedding') throw new Error('Documents can be added later only to a wedding booking.')
  if (!(key in LATE_DOCUMENTS)) throw new Error('Only the marriage license, Pre-Cana, banns and confession documents can be added after the booking is submitted.')
  if (b.status !== 'submitted' && b.status !== 'approved') throw new Error('Documents can be added only while the booking is submitted or approved.')
  return withDerived(save({ ...b, formData: { ...b.formData, [key]: fileUrl } }))
}

/** Mock mode has no PayMongo: "paying" marks the booking paid immediately. */
export async function initiatePayment(id: string): Promise<{ checkoutUrl: string; checkoutSessionId: string }> {
  await guard("We couldn't start your GCash payment. Please try again in a moment.")
  const b = find(id)
  if (b.paymentStatus === 'paid') throw new Error('This booking has already been paid.')
  const payable = (b.status === 'submitted' || b.status === 'returned') && (b.paymentStatus === 'unpaid' || b.paymentStatus === 'pending_cash')
  if (!payable) throw new Error('This booking has no payment due.')
  save({ ...b, paymentStatus: 'paid', paymentMethod: 'gcash', paidAt: new Date().toISOString(), paymentReference: `pay_mock_${id.slice(0, 8)}`, paymentHoldExpiresAt: null })
  return { checkoutUrl: `/payment/success?bookingId=${encodeURIComponent(id)}`, checkoutSessionId: `cs_mock_${id}` }
}

/** Mock mode pays at once in initiatePayment, so these only keep the data layer's shape; any code "works" except a blank one. */
export async function fetchPaymentQr(id: string): Promise<PaymentQr> {
  await guard("We couldn't create your QR code. Please try again in a moment.")
  const b = find(id)
  const svg =
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' fill='white'/><g fill='black'><rect x='8' y='8' width='26' height='26'/><rect x='66' y='8' width='26' height='26'/><rect x='8' y='66' width='26' height='26'/><rect x='42' y='42' width='16' height='16'/><rect x='66' y='66' width='10' height='10'/></g></svg>"
  return { qrImage: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`, amountCentavos: b.amountDueCentavos ?? 0, reference: b.referenceNumber ?? id }
}

export async function sendSimulatedCode(_id: string, mobile: string): Promise<SimulatedCodeSent> {
  await guard("We couldn't send the code. Please try again in a moment.")
  return { channel: 'sms', to: `${mobile.slice(0, 4)}***${mobile.slice(-3)}`, expiresInSeconds: 300 }
}

export async function confirmSimulatedPayment(id: string, code: string): Promise<Booking> {
  await guard("We couldn't confirm the payment. Please try again in a moment.")
  if (!/^\d{6}$/.test(code)) throw new Error('Enter the 6-digit code.')
  const b = find(id)
  return withDerived(save({ ...b, paymentStatus: 'paid', paymentMethod: 'gcash', paidAt: new Date().toISOString(), paymentReference: `pay_sim_${id.slice(0, 8)}`, paymentHoldExpiresAt: null }))
}

/** Mirrors PaymentController::chooseCash: an unpaid, submitted booking with a live hold; the deadline does not move. */
export async function chooseCashPayment(id: string): Promise<Booking> {
  await guard("We couldn't save your choice. Please try again in a moment.")
  const b = find(id)
  if (b.paymentStatus === 'paid') throw new Error('This booking has already been paid.')
  if (b.paymentStatus === 'pending_cash' && b.status === 'submitted') return b
  if (b.paymentStatus !== 'unpaid') throw new Error('This booking has no payment due.')
  if (b.status !== 'submitted') throw new Error('Cash at the parish office can be chosen only for a submitted booking that is waiting for payment.')
  if (!b.paymentHoldExpiresAt || Date.parse(b.paymentHoldExpiresAt) <= Date.now()) {
    throw new Error('The payment window for this booking has closed, so its time is no longer held. Please make a new booking.')
  }
  return save({ ...b, paymentStatus: 'pending_cash', paymentMethod: 'cash' })
}

export async function fetchCertificateHtml(id: string): Promise<string> {
  await guard(`Failed to fetch certificate for booking ${id}`)
  const b = find(id)
  const filled = ['baptism', 'wedding'].includes(b.sacrament) && ['submitted', 'returned', 'approved', 'completed'].includes(b.status)
  if (!b.registerEntry && !filled) throw new Error('Certificate has not been generated yet.')
  return `<html><body><h1>Certificate of ${b.sacrament}</h1><p>Booking ${b.referenceNumber}</p></body></html>`
}
