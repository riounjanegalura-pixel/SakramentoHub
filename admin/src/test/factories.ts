import type { AdminAnalytics, AdminBooking, AdminCertificateRequest, BookingDocument, Milestone, Paginated, RegisterEntry, RegisterEntryDetail } from '../lib/types'

/** A complete `AdminBooking` (rule T11). Every admin test builds bookings through this so a new API field is added in one place. */
export function adminBooking(overrides: Partial<AdminBooking> = {}): AdminBooking {
  return {
    id: '1',
    referenceNumber: 'BAPT-20260101-A1B2',
    userId: 'u1',
    user: { fullName: 'Juana Dela Cruz', email: 'juana@example.com', phone: null },
    sacrament: 'baptism',
    isPriority: false,
    status: 'submitted',
    statusLabel: 'Awaiting review',
    formData: {},
    appointmentDate: null,
    appointmentStart: null,
    appointmentEnd: null,
    isEmergency: false,
    paymentStatus: null,
    amountDueCentavos: null,
    paymentHoldExpiresAt: null,
    paidAt: null,
    paymentReference: null,
    refundReference: null,
    refundedAt: null,
    statusReason: null,
    returnNote: null,
    checkoutSessionId: null,
    paymentMethod: null,
    cashReceiptReference: null,
    createdAt: '2026-01-01T00:00:00Z',
    channel: 'online',
    amountPaidCentavos: null,
    amountRefundedCentavos: 0,
    overpaidCentavos: 0,
    documents: [],
    milestones: [],
    checkedInAt: null,
    checkedInBy: null,
    dayPass: null,
    registerEntry: null,
    subjectName: 'Juana Dela Cruz',
    createdBy: null,
    walkInContact: null,
    ...overrides,
  }
}

export function bookingDocument(overrides: Partial<BookingDocument> = {}): BookingDocument {
  return { key: 'deathCertificate', label: 'Death certificate', required: true, url: '/documents/u1/death.pdf', review: null, ...overrides }
}

export function paginated<T>(data: T[]): Paginated<T> {
  return {
    data,
    links: { first: null, last: null, prev: null, next: null },
    meta: { current_page: 1, last_page: 1, per_page: 15, total: data.length },
  }
}

export function adminAnalytics(overrides: Partial<AdminAnalytics> = {}): AdminAnalytics {
  return {
    byStatus: { submitted: 3, approved: 2, completed: 1 },
    bySacrament: { baptism: 4, wedding: 2 },
    createdLast7Days: 5,
    createdLast30Days: 6,
    donations: { totalCentavos: 0, count: 0 },
    attention: { awaitingReview: 0, urgentOpen: 0, refundDue: 0, overpaid: 0, todayAppointments: 0, holdsExpiringSoon: 0, certificateRequests: 0 },
    visitsAhead: [],
    bookingsPerDay: [],
    waitingPreview: [],
    dueSoon: [],
    ...overrides,
  }
}

/** A complete `RegisterEntry` (a system-made baptism by default). */
export function registerEntry(overrides: Partial<RegisterEntry> = {}): RegisterEntry {
  return {
    id: 'r1',
    registerNumber: 'BAP-2026-0007',
    sacrament: 'baptism',
    register: 'Baptism',
    year: 2026,
    sequence: 7,
    source: 'system',
    status: 'valid',
    subjectName: 'Juana Dela Cruz',
    ceremonyDate: '2026-03-14',
    bookNo: null,
    pageNo: null,
    lineNo: null,
    verifiable: true,
    verifyCode: 'ABCD-EFGH-JKMN',
    verifyUrl: 'https://parish.test/verify/BAP-2026-0007/ABCD-EFGH-JKMN',
    snapshot: {
      subjectName: 'Juana Dela Cruz',
      ceremonyDate: '2026-03-14',
      minister: 'Rev. Fr. Leopoldo S. Evangelista',
      parishName: 'St. Peter the Apostle Parish',
      parishAddress: 'Balagtas, Bulacan',
      title: 'Certificate of Baptism',
      statement: 'This is to certify that Juana Dela Cruz was baptized on March 14, 2026.',
      details: [{ label: 'Father', value: 'Pedro Dela Cruz' }, { label: 'Mother', value: 'Maria Dela Cruz' }],
    },
    bookingId: '1',
    bookingReference: 'BAPT-20260101-A1B2',
    revokedReason: null,
    revokedAt: null,
    correctedAt: null,
    enteredBy: { id: 's1', fullName: 'Staff One' },
    enteredAt: '2026-03-14T02:00:00Z',
    ...overrides,
  }
}

export function registerEntryDetail(overrides: Partial<RegisterEntryDetail> = {}): RegisterEntryDetail {
  return { ...registerEntry(), history: [], ...overrides }
}

export function certificateRequest(overrides: Partial<AdminCertificateRequest> = {}): AdminCertificateRequest {
  return {
    id: 'c1',
    referenceNumber: 'CERT-20261005-AB12',
    sacrament: 'baptism',
    personName: 'Pedro Santos',
    sacramentDateText: 'May 1998',
    details: { fatherName: 'Jose Santos', motherName: 'Maria Santos', spouseName: null },
    relationship: 'self',
    purpose: 'Passport application',
    status: 'submitted',
    declineReason: null,
    registerEntry: null,
    createdAt: '2026-10-05T02:00:00.000000Z',
    closedAt: null,
    requester: { fullName: 'Pedro Santos', email: 'pedro@example.com', phone: '09171234567' },
    idUrl: '/documents/u9/id.jpg',
    letterUrl: null,
    filesRemovedAt: null,
    handledBy: null,
    ...overrides,
  }
}

export function milestone(overrides: Partial<Milestone> = {}): Milestone {
  return {
    key: 'canonical_interview', label: 'Canonical interview', done: false, state: 'upcoming', source: null,
    dueDate: '2026-12-01', gating: true, manual: true, note: null, doneAt: null, data: null, doneBy: null, ...overrides,
  }
}
