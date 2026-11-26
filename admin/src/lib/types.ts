// Mirrors docs/api-contract.md's "## Shapes" block — the admin app's only
// spec for what the API returns. Kept in one file (rather than parishioner's
// lib/mock/types.ts convention) since this app has no mock layer to share
// types with.

export type Sacrament =
  | 'baptism'
  | 'wedding'
  | 'confirmation'
  | 'funeral'
  | 'anointing'
  | 'house-blessing'

/** 'not_required' = donation-based (no fee); 'unpaid' = fee due, slot held
 * until paymentHoldExpiresAt; 'paid' = confirmed by PayMongo's signed webhook,
 * or cash recorded by staff; 'refund_due' = paid then declined/cancelled, staff must
 * refund in the PayMongo dashboard; 'refunded' = staff recorded that refund;
 * 'void' = unpaid booking that closed before payment; 'pending_cash' = the
 * parishioner will pay cash at the parish office (slot held on the same
 * deadline as 'unpaid'), and staff mark it received, which makes it 'paid'. */
export type PaymentStatus = 'not_required' | 'unpaid' | 'pending_cash' | 'paid' | 'refund_due' | 'refunded' | 'void'

// draft -> submitted -> approved -> completed (happy path)
// submitted -> returned -> submitted          (staff asks for changes)
// submitted/returned -> declined              (staff declines the request)
// draft/submitted/returned/approved -> cancelled
export type BookingStatus = 'draft' | 'submitted' | 'returned' | 'approved' | 'completed' | 'declined' | 'cancelled'

export type Role = 'parishioner' | 'staff' | 'admin'

export type Channel = 'online' | 'walk_in'

export interface DocumentReview {
  status: 'accepted' | 'rejected'
  note: string | null
  /** Reviewer's full name; the backend sends it to staff only. */
  reviewedBy: string | null
  reviewedAt: string | null
}

/** One row of a booking's document checklist (backend `Booking::documentChecklist()`). */
export interface BookingDocument {
  key: string
  label: string
  required: boolean
  /** API path of the uploaded file (`/documents/{id}/{file}`), null when nothing is uploaded yet. */
  url: string | null
  /** Only the review of the file that is attached now; a replaced file shows null. */
  review: DocumentReview | null
}

export interface User {
  id: string
  fullName: string
  email: string
  phone: string
  address: string
  role: Role
  isActive: boolean
}

/** One row of a wedding's preparation checklist (backend `MilestoneResource`; `doneBy` is staff-only). */
export type MilestoneState = 'done' | 'due' | 'overdue' | 'upcoming'
export interface Milestone {
  key: string
  label: string
  done: boolean
  state: MilestoneState
  /** Null while the step is open. */
  source: 'auto' | 'document' | 'staff' | null
  dueDate: string | null
  /** Must be done before the wedding can be marked completed. */
  gating: boolean
  /** Staff can tick it by hand. */
  manual: boolean
  note: string | null
  doneAt: string | null
  /** Marriage license ticks only. */
  data: { licenseNumber: string; issuedOn: string; issuedAt: string } | { art34: true } | null
  doneBy: { id: string; fullName: string | null } | null
}

/** Mirrors backend AdminBookingResource (BookingResource + owner + priority). */
export interface AdminBooking {
  id: string
  referenceNumber: string
  userId: string | null
  user: { fullName: string | null; email: string | null; phone: string | null }
  sacrament: Sacrament
  isPriority: boolean
  status: BookingStatus
  statusLabel: string
  formData: Record<string, unknown>
  appointmentDate: string | null
  appointmentStart: string | null
  appointmentEnd: string | null
  isEmergency: boolean
  paymentStatus: PaymentStatus | null
  amountDueCentavos: number | null
  paymentHoldExpiresAt: string | null
  /** The office approves this booking before it is paid, so an unpaid fee does not block Approve. */
  paymentAfterApproval?: boolean
  paidAt: string | null
  paymentReference: string | null
  refundReference: string | null
  refundedAt: string | null
  statusReason: string | null
  returnNote: string | null
  checkoutSessionId: string | null
  /** 'gcash' | 'cash' once known. */
  paymentMethod: 'gcash' | 'cash' | null
  /** The office's receipt number for cash, when one was given. */
  cashReceiptReference: string | null
  createdAt: string
  channel: Channel
  amountPaidCentavos: number | null
  amountRefundedCentavos: number
  /** Derived by the server: paid - refunded - due, only while the booking is paid. */
  overpaidCentavos: number
  documents: BookingDocument[]
  /** A wedding's preparation checklist; [] for every other sacrament. */
  milestones: Milestone[]
  /** ISO time the office checked the party in on the appointment day. */
  checkedInAt: string | null
  checkedInBy: { id: string; fullName: string | null } | null
  /** Approved + appointment only; `qrSvg` comes on single-booking responses. */
  dayPass: { url: string; qrSvg?: string } | null
  /** The parish register entry made when the booking was completed; null before that. */
  registerEntry: BookingRegisterEntry | null
  /** Who the booking is for (the child, the couple, the deceased...), falling back to the owner. */
  subjectName: string
  /** The staff member who entered a walk-in; null for online bookings. */
  createdBy: { id: string; fullName: string | null } | null
  /** The walk-in contact; null unless channel is walk_in. */
  walkInContact: {
    fullName: string | null
    phone: string | null
    email: string | null
    relationship: string | null
  } | null
}

export interface AuditLogEntry {
  id: string
  action: string
  subjectType: string
  subjectId: string
  metadata: Record<string, unknown>
  /** Null name/email = a system action (webhook, scheduled job). */
  actor: { id: string | null; fullName: string | null; email: string | null }
  createdAt: string
}

export interface AttentionCounts {
  awaitingReview: number
  urgentOpen: number
  refundDue: number
  overpaid: number
  todayAppointments: number
  holdsExpiringSoon: number
  certificateRequests: number
}

export interface AdminAnalytics {
  byStatus: Partial<Record<BookingStatus, number>>
  bySacrament: Partial<Record<Sacrament, number>>
  createdLast7Days: number
  createdLast30Days: number
  /** Paid donations only (GCash); pending ones are not counted. */
  donations: { totalCentavos: number; count: number }
  attention: AttentionCounts
  /** The next 14 parish days starting tomorrow, appointments per day (zero days listed). */
  visitsAhead: DayCount[]
  /** The last 14 parish days ending today, bookings created per day (zero days listed). */
  bookingsPerDay: DayCount[]
  /** Up to three bookings that need the priest next. */
  waitingPreview: WaitingPreviewItem[]
  /** Visits falling due today and in the next two days, soonest first. */
  dueSoon: DueSoonItem[]
}

export interface DayCount {
  date: string
  count: number
}

export interface WaitingPreviewItem {
  kind: 'hold' | 'review' | 'refund'
  bookingId: string
  subjectName: string
  sacrament: Sacrament
  holdExpiresAt?: string
  submittedAt?: string
  refundCentavos?: number
}

export interface DueSoonItem {
  bookingId: string
  subjectName: string
  service: string
  /** YYYY-MM-DD, parish time. */
  date: string
  /** HH:MM, or null when no time is set. */
  start: string | null
  paymentStatus: string | null
}

export interface BookingNote {
  id: number
  body: string
  author: { id: string; fullName: string } | null
  createdAt: string
}

/** Same shape the parishioner app reads; `createdAt` is ISO. */
export interface AppNotification {
  id: string
  title: string
  body: string
  category: 'today' | 'earlier'
  read: boolean
  icon: 'calendar' | 'booking' | 'announcement'
  createdAt: string | null
  bookingId: string | null
  link: string | null
}

// ---- Schedule (GET /admin/schedule) ----
export interface ScheduleBlackout {
  reason: string
  appliesTo: string
}
export interface ScheduleMassItem {
  type: 'mass'
  title: string
  start: string
  end: string
}
export interface ScheduleSessionItem {
  type: 'session'
  sacrament: Sacrament
  start: string
  end: string
  booked: number
  capacity: number
}
export interface ScheduleBookingItem {
  type: 'booking'
  id: string
  referenceNumber: string
  sacrament: Sacrament
  subjectName: string
  start: string
  end: string | null
  status: BookingStatus
  paymentStatus: PaymentStatus | null
  isOffsite: boolean
  channel: Channel
  inSession: boolean
  checkedInAt: string | null
  contactName: string | null
  contactRelationship: string | null
  contactPhone: string | null
  /** The off-site address; null for a visit at the church. */
  location: string | null
}
export type ScheduleItem = ScheduleMassItem | ScheduleSessionItem | ScheduleBookingItem
export interface ScheduleDay {
  date: string
  blackouts: ScheduleBlackout[]
  items: ScheduleItem[]
}
export interface UnscheduledRequest {
  id: string
  referenceNumber: string
  subjectName: string
  contactPhone: string | null
  status: BookingStatus
  createdAt: string
}
export interface Schedule {
  travelBufferMinutes: number
  days: ScheduleDay[]
  unscheduled: UnscheduledRequest[]
}

/** GET /services/{sacrament}/availability */
export interface DayAvailability {
  date: string
  status: 'free' | 'limited' | 'full' | 'unavailable'
  reason: string | null
  freeStarts: string[]
}

// ---- Settings (GET /admin/settings) ----
/** One fixed weekly Mass: no sacrament is offered at these times. A first-Friday row has no weekdays. */
export interface MassRow {
  label: string
  time: string
  durationMinutes: number
  weekdays: number[]
  firstFriday: boolean
}
export interface ParishSettings {
  parishName: string
  parishAddress: string
  priestName: string
  parishPhone: string
  workingHoursStart: string
  workingHoursEnd: string
  /** The office closes for lunch; equal times mean no break. */
  lunchStart: string
  lunchEnd: string
  slotStepMinutes: number
  travelBufferMinutes: number
  /** The days the office is open (ISO weekdays, Monday = 1), shown to parishioners as office hours. */
  officeDays: number[]
  /** The public contact email, or null for none. */
  parishEmail: string | null
  /** Spare minutes between two visits, so back-to-back times never crowd each other. */
  slotGapMinutes: number
  /** Quiet minutes kept before and after every Mass. */
  massBufferMinutes: number
  /** The fixed weekly Masses. */
  massSchedule: MassRow[]
  /** Printed under the priest's name in the certificate signature block. */
  priestTitle: string
  /** A PNG or JPEG data URL printed above the signature line, or null for none. */
  priestSignature: string | null
}
export type FeeRule = 'none' | 'flat' | 'per_sponsor'
export interface AdminService {
  id: Sacrament
  name: string
  description: string | null
  feeRule: FeeRule
  priceCentavos: number | null
  durationMinutes: number
  offsite: boolean
  /** ISO weekdays: 1 = Monday ... 7 = Sunday. */
  allowedWeekdays: number[]
  leadTimeDays: number
  dailyCapacity: number | null
  hasSessions: boolean
  /** The four session fields are null when hasSessions is false. */
  sessionWeekdays: number[] | null
  sessionTimes: string[] | null
  sessionCapacity: number | null
  sessionDurationMinutes: number | null
  sponsorFeeAllowed: boolean
}
export type ServiceUpdate = Partial<
  Pick<
    AdminService,
    | 'name' | 'description' | 'feeRule' | 'priceCentavos' | 'durationMinutes' | 'allowedWeekdays' | 'leadTimeDays'
    | 'dailyCapacity' | 'sessionWeekdays' | 'sessionTimes' | 'sessionCapacity' | 'sessionDurationMinutes'
  >
>
export interface AdminSettings {
  parish: ParishSettings
  services: AdminService[]
  policy: { paymentHoldHours: number; returnedHoldDays: number; changeCutoffDays: number }
  triduum: { date: string; reason: string }[]
}
export interface Blackout {
  id: number
  date: string
  reason: string
  /** null = every service. */
  sacraments: Sacrament[] | null
}
export interface BlackoutInput {
  date: string
  endDate?: string
  reason: string
  sacraments?: Sacrament[] | null
}
export interface AffectedBooking {
  id: string
  referenceNumber: string
  sacrament: Sacrament
  subjectName: string
  appointmentDate: string
  appointmentStart: string
}
export interface BlackoutResult {
  blackouts: Blackout[]
  affectedBookings: AffectedBooking[]
}

// ---- Reports (GET /admin/reports/summary) ----
export interface ReportQuery {
  from: string
  to: string
  sacrament?: Sacrament | ''
}
export interface ReportSummary {
  range: { from: string; to: string }
  totals: { bookings: number; completed: number; declined: number; cancelled: number; online: number; walkIn: number; urgent: number }
  bySacrament: { sacrament: Sacrament; name: string; total: number; byStatus: Partial<Record<BookingStatus, number>> }[]
  money: { collectedCentavos: number; refundedCentavos: number; refundDueCentavos: number; overpaidCentavos: number }
  monthly?: { month: string; bookings: number; byStatus: Partial<Record<BookingStatus, number>>; donationsCentavos: number; certificatesIssued: number }[]
  byWeekday?: number[]
  donations?: { totalCentavos: number; count: number }
  certificates?: { issued: number }
  previous?: { range: { from: string; to: string }; bookings: number; completed: number; donationsCentavos: number; certificatesIssued: number }
}

// Single source of truth: backend's config('parish_events.categories'),
// validated server-side via Rule::in() — kept here as the one place this
// admin app also names the same list, matching how Sacrament above mirrors
// config('booking.slot_capacity')'s keys.
export type ParishEventCategory =
  | 'mass'
  | 'feast'
  | 'seminar'
  | 'fundraiser'
  | 'community'
  | 'notice'
  | 'baptism'
  | 'wedding'
  | 'confirmation'
  | 'funeral'
  | 'anointing'
  | 'house-blessing'
  | 'general'
  | 'other'

export interface ParishEvent {
  id: string
  title: string
  date: string
  location: string
  imageUrl: string | null
  category: ParishEventCategory
}

export interface AdminParishEvent extends ParishEvent {
  /** How long the event runs, in minutes. */
  durationMinutes: number
  /** While true, no sacrament is offered during the event. */
  blocksBookings: boolean
  createdBy: string | null
  createdByName: string | null
  createdAt: string
  updatedAt: string
}

// Laravel's default paginator envelope, returned by every admin list route.
export interface PaginatedLinks {
  first: string | null
  last: string | null
  prev: string | null
  next: string | null
}

export interface PaginatedMeta {
  current_page: number
  last_page: number
  per_page: number
  total: number
}

export interface Paginated<T> {
  data: T[]
  links: PaginatedLinks
  meta: PaginatedMeta
}

/** What a booking carries about its register entry (`registerEntry` on the booking resources). */
export interface BookingRegisterEntry {
  id: string
  registerNumber: string
  status: RegisterStatus
  enteredAt: string
}

export type RegisterStatus = 'valid' | 'revoked'
export type RegisterSource = 'system' | 'transcribed'
/** The four registers a paper entry can be copied into. */
export type TranscribableSacrament = 'baptism' | 'confirmation' | 'wedding' | 'funeral'

export interface RegisterDetail {
  label: string
  value: string
}

/** Mirrors backend RegisterEntryResource. */
export interface RegisterEntry {
  id: string
  registerNumber: string
  sacrament: string
  /** Register name: Baptism, Confirmation, Marriage, Death, Anointing of the Sick, Blessing or Service. */
  register: string
  year: number
  sequence: number
  source: RegisterSource
  status: RegisterStatus
  subjectName: string
  ceremonyDate: string
  bookNo: string | null
  pageNo: string | null
  lineNo: string | null
  verifiable: boolean
  verifyCode: string | null
  verifyUrl: string | null
  snapshot: {
    subjectName: string
    ceremonyDate: string
    minister: string
    parishName: string
    parishAddress: string
    title: string
    statement: string
    details: RegisterDetail[]
  }
  bookingId: string | null
  bookingReference: string | null
  revokedReason: string | null
  revokedAt: string | null
  correctedAt: string | null
  enteredBy: { id: string; fullName: string | null } | null
  enteredAt: string
}

/** `GET /admin/register/:id`: the entry plus its audit rows, oldest first. */
export interface RegisterEntryDetail extends RegisterEntry {
  history: AuditLogEntry[]
}

export type CertificateRequestStatus = 'submitted' | 'issued' | 'declined' | 'cancelled'

export interface AdminCertificateRequest {
  id: string
  referenceNumber: string
  sacrament: TranscribableSacrament
  personName: string
  sacramentDateText: string
  details: { fatherName: string | null; motherName: string | null; spouseName: string | null; registerNumber?: string | null }
  relationship: 'self' | 'parent' | 'child' | 'spouse' | 'sibling' | 'representative'
  purpose: string
  status: CertificateRequestStatus
  declineReason: string | null
  registerEntry: { id: string; registerNumber: string } | null
  createdAt: string
  closedAt: string | null
  requester: { fullName: string; email: string | null; phone: string | null }
  /** Relative API paths (open through the authenticated loader); null once the files are removed. */
  idUrl: string | null
  letterUrl: string | null
  filesRemovedAt: string | null
  handledBy: { id: string; fullName: string } | null
}
