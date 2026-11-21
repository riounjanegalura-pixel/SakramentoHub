export type Sacrament = 'baptism' | 'wedding' | 'confirmation' | 'funeral' | 'anointing' | 'house-blessing'

export type BookingStatus =
  | 'draft' | 'submitted' | 'returned' | 'approved' | 'completed' | 'declined' | 'cancelled'

export type PaymentStatus = 'not_required' | 'unpaid' | 'pending_cash' | 'paid' | 'refund_due' | 'refunded' | 'void'

export interface PsgcAddress {
  display: string
  regionCode: string
  provinceCode: string
  cityCode: string
  barangayCode: string
}

export interface User {
  id: string
  fullName: string
  email: string
  phone: string
  address: string
  emailVerifiedAt?: string | null
  birthDate?: string | null
  sex?: 'male' | 'female' | null
  civilStatus?: string | null
  addressLine?: string | null
  addressPsgc?: PsgcAddress | null
  homeParish?: string | null
  /** From the server's UserResource; staff and admin accounts get the office desk. */
  role?: 'parishioner' | 'staff' | 'admin'
  /** Parishioners only, and only on GET /me. */
}

export type FeeRule = 'flat' | 'per_sponsor' | 'none'

export interface Service {
  id: string
  sacrament: Sacrament
  name: string
  description: string
  priceCentavos: number | null
  feeRule: FeeRule
  durationMinutes: number
  offsite: boolean
  allowedWeekdays: number[] // ISO: 1 = Mon … 7 = Sun
  leadTimeDays: number
  dailyCapacity: number | null
  sessionWeekdays: number[] | null
  sessionTimes: string[] | null
  sessionCapacity: number | null
}

export type WalletKind =
  | 'birth_certificate'
  | 'baptismal_certificate'
  | 'confirmation_certificate'
  | 'marriage_contract'
  | 'cenomar'
  | 'death_certificate'
  | 'other'

/** One document a service asks people to prepare (GET /services/{id}/requirements). */
export interface RequirementDocument {
  key: string
  label: string
  walletKind: WalletKind
  requirement: 'required' | 'conditional' | 'optional'
  /** Text for a conditional row, e.g. "Required unless the parents are not married". */
  condition: string | null
}

export interface ServiceRequirements {
  serviceId: string
  documents: RequirementDocument[]
}

/** A document the parishioner keeps for reuse (GET /wallet). */
export interface WalletDocument {
  id: string
  kind: WalletKind
  personName: string
  fileUrl: string
  originalName: string
  mime: string
  sizeBytes: number
  createdAt: string
}

/** A register entry the parishioner may open (GET /register-entries). */
export interface RegisterEntrySummary {
  id: string
  registerNumber: string
  register: string
  subjectName: string
  ceremonyDate: string
  status: 'valid' | 'revoked'
  verifyUrl: string | null
  via: 'booking' | 'request'
}

export type DocumentReviewStatus = 'accepted' | 'rejected'

/** One row of a booking's document checklist (backend `Booking::documentChecklist`, reviewer name omitted). */
export interface BookingDocument {
  key: string
  label: string
  required: boolean
  /** The file currently attached, or null. */
  url: string | null
  /** Staff's verdict on that exact file; null = not reviewed (or the file was replaced since). */
  review: { status: DocumentReviewStatus; note: string | null; reviewedAt: string | null } | null
}

export type MilestoneState = 'done' | 'due' | 'overdue' | 'upcoming'

/** One row of a wedding's preparation checklist (backend `Milestone`). Every other sacrament has none. */
export interface Milestone {
  key: string
  label: string
  done: boolean
  state: MilestoneState
  source: 'auto' | 'document' | 'staff' | null
  dueDate: string | null
  gating: boolean
  manual: boolean
  doneAt: string | null
  data: { licenseNumber: string; issuedOn: string; issuedAt: string } | { art34: true } | null
}

/** The day pass of an approved booking. `qrSvg` is drawn only on a single-booking response, never in a list. */
export interface DayPass {
  url: string
  qrSvg?: string
}

/** The parish register entry a completed booking produced (null until it is recorded). */
export interface BookingRegisterEntry {
  id: string
  registerNumber: string
  status: 'valid' | 'revoked'
  enteredAt: string
}

/** What the public certificate check reveals — deliberately the minimum. */
export interface CertificateVerification {
  status: 'valid' | 'revoked'
  parishName: string
  sacrament: string
  registerNumber: string
  subjectName: string
  ceremonyDate: string
  minister: string
  correctedOn: string | null
}

export interface Booking {
  id: string
  referenceNumber: string
  userId: string | null
  sacrament: Sacrament
  status: BookingStatus
  statusLabel: string
  formData: Record<string, unknown>
  appointmentDate: string | null
  appointmentStart: string | null
  appointmentEnd: string | null
  isEmergency: boolean
  paymentStatus: PaymentStatus | null
  /** The server's answer to "can the owner pay online right now?". Absent on the mock layer, which keeps the older order. */
  canPayNow?: boolean
  amountDueCentavos: number | null
  paymentHoldExpiresAt: string | null
  paidAt: string | null
  paymentReference: string | null
  /** 'gcash' or 'cash' once known; older responses may leave it out. */
  paymentMethod?: 'gcash' | 'cash' | null
  /** The parish office's receipt number for cash, when it gave one. */
  cashReceiptReference?: string | null
  refundReference: string | null
  refundedAt: string | null
  statusReason: string | null
  returnNote: string | null
  documents?: BookingDocument[]
  registerEntry?: BookingRegisterEntry | null
  milestones?: Milestone[]
  checkedInAt?: string | null
  dayPass?: DayPass | null
  createdAt: string
  /** 'walk_in' when the parish office entered it at the desk. */
  channel?: 'online' | 'walk_in'
  /** Mock only: when staff returned it, so the mock can expire the 7-day hold. */
  returnedAt?: string | null
  /** Mock only: the slot the booking was returned with, so the mock can apply the server's "still holds its slot" rule. */
  returnedSlot?: { date: string; start: string } | null
}

export type ParishEventCategory = 'mass' | 'feast' | 'seminar' | 'fundraiser' | 'community' | 'notice' | 'general' | 'other' | Sacrament

export interface ParishEvent {
  id: string
  title: string
  date: string
  location: string
  imageUrl: string
  category: ParishEventCategory
}

export interface DraftInput {
  userId: string
  sacrament: Sacrament
  formData: Record<string, unknown>
  appointmentDate?: string | null
  appointmentStart?: string | null
}

export interface DraftPatch {
  formData?: Record<string, unknown>
  appointmentDate?: string | null
  appointmentStart?: string | null
}

export interface ScheduleContext {
  scheduleType?: 'regular' | 'special'
  massType?: 'church' | 'house'
  /** Office desk only: ask the server to ignore the lead-time rule (honoured for a staff caller only). */
  waiveLeadTime?: boolean
}

export type AvailabilityStatus = 'free' | 'limited' | 'full' | 'unavailable'

export interface DayAvailability {
  date: string
  status: AvailabilityStatus
  reason: string | null
  freeStarts: string[]
}

export interface RangeDay {
  date: string
  status: AvailabilityStatus
  reason: string | null
  freeCount: number
}

export interface ParishInfo {
  name: string
  phone: string
  /** Where to pay cash at the parish office. */
  address?: string
  priestName: string
  workingHours: { start: string; end: string }
  /** No visit starts in or runs through this break. */
  lunchBreak?: { start: string; end: string }
  /** Demo only: after a real PayMongo payment the app asks the payer to verify their mobile number with an SMS code. */
  demoPaymentOtp?: boolean
  /** The parish office approves a booking before the parishioner can pay it. */
  approvalBeforePayment?: boolean
}

/** The person standing at the counter; they need no account. */
export interface WalkInContact {
  fullName: string
  phone: string
  /** '' when none was given. */
  email: string
}

/** A booking as the office sees it (`AdminBookingResource`): the `Booking` shape plus who it is for. */
export interface DeskBooking extends Booking {
  channel: 'online' | 'walk_in'
  /** The owner account, or the walk-in contact when none is linked. */
  user: { fullName: string; email: string | null; phone: string | null }
  /** The contact the desk entered (`owner_snapshot`); null unless `channel === 'walk_in'`. */
  walkInContact: { fullName: string | null; phone: string | null; email: string | null; relationship: string | null } | null
  createdBy: { id: string; fullName: string | null } | null
}

export interface ParishionerMatch {
  id: string
  fullName: string
}

export interface PaymentLink {
  checkoutUrl: string
  checkoutSessionId: string
}

export type CertificateSacrament = 'baptism' | 'confirmation' | 'wedding' | 'funeral'
export type CertificateRelationship = 'self' | 'parent' | 'child' | 'spouse' | 'sibling' | 'representative'
export type CertificateRequestStatus = 'submitted' | 'issued' | 'declined' | 'cancelled'

/** A request for a copy of a past record (GET /certificate-requests). The ID and letter addresses never appear here. */
export interface CertificateRequest {
  id: string
  referenceNumber: string
  sacrament: CertificateSacrament
  personName: string
  sacramentDateText: string
  details: { fatherName: string | null; motherName: string | null; spouseName: string | null; registerNumber?: string | null }
  relationship: CertificateRelationship
  purpose: string
  status: CertificateRequestStatus
  declineReason: string | null
  registerEntry: { id: string; registerNumber: string } | null
  createdAt: string
  closedAt: string | null
}

/** Body of POST /certificate-requests. */
export interface CertificateRequestInput {
  sacrament: CertificateSacrament
  /** The number printed on the certificate; with it the name and date are not needed. */
  registerNumber?: string
  personName?: string
  sacramentDateText?: string
  details?: { fatherName?: string; motherName?: string; spouseName?: string }
  relationship: CertificateRelationship
  purpose: string
  idUrl: string
  letterUrl?: string
}

/** Where the demo's one-time code went: a text to the mobile number, or (no SMS gateway) the account's email. */
export interface SimulatedCodeSent {
  channel: 'sms' | 'email'
  /** Masked destination, e.g. `0917***567`. */
  to: string
  expiresInSeconds: number
}

/** A QR Ph code to pay a booking: `qrImage` is a base64 data URL PayMongo generated for the exact amount. */
export interface PaymentQr {
  qrImage: string
  amountCentavos: number
  reference: string
}
