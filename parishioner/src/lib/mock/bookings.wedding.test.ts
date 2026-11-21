import { describe, it, expect, beforeEach } from 'vitest'
import { attachLateDocument, fetchBooking, fetchBookings } from './bookings'
import { seedBooking } from '../../test/seed'
import { addDaysYmd, parishToday } from '../domain'

describe('bookings mock: wedding preparation and day pass', () => {
  beforeEach(() => localStorage.clear())

  const inDays = (n: number) => addDaysYmd(parishToday(), n)

  it('gives a wedding a 12-row checklist in the server order, 13 for a mixed marriage', async () => {
    const plain = seedBooking({ sacrament: 'wedding', status: 'approved', appointmentDate: inDays(90), appointmentStart: '10:00', paymentStatus: 'paid', formData: { groomReligion: 'Catholic', brideReligion: 'roman catholic' } })
    const mixed = seedBooking({ sacrament: 'wedding', status: 'submitted', appointmentDate: inDays(90), appointmentStart: '10:00', formData: { groomReligion: 'Catholic', brideReligion: 'Iglesia ni Cristo' } })
    const a = await fetchBooking(plain.id)
    const b = await fetchBooking(mixed.id)
    expect(a.milestones!.map((m) => m.key)).toEqual([
      'submitted', 'paid', 'core_documents', 'canonical_interview', 'banns_requested', 'pre_cana', 'banns_completed',
      'marriage_license', 'confession', 'approved', 'wedding_day', 'civil_registry',
    ])
    expect(b.milestones).toHaveLength(13)
    expect(a.milestones!.find((m) => m.key === 'approved')!.done).toBe(true)
    expect(a.milestones!.find((m) => m.key === 'canonical_interview')!.dueDate).toBe(inDays(30))
  })

  it('marks a step overdue once its date has passed', async () => {
    const w = seedBooking({ sacrament: 'wedding', status: 'approved', appointmentDate: inDays(20), appointmentStart: '10:00' })
    const m = (await fetchBooking(w.id)).milestones!
    expect(m.find((x) => x.key === 'canonical_interview')!.state).toBe('overdue')
    expect(m.find((x) => x.key === 'confession')!.state).toBe('upcoming')
  })

  it('leaves other sacraments with no checklist, no pass and no check-in', async () => {
    const f = seedBooking({ sacrament: 'funeral', status: 'submitted', userId: 'u1' })
    const got = await fetchBooking(f.id)
    expect(got.milestones).toEqual([])
    expect(got.dayPass).toBeNull()
    expect(got.checkedInAt).toBeNull()
  })

  it('returns a day pass with a QR only for an approved booking with an appointment, and only on a single read', async () => {
    const ok = seedBooking({ sacrament: 'wedding', status: 'approved', paymentStatus: 'paid', userId: 'u1', appointmentDate: inDays(30), appointmentStart: '10:00' })
    const awaitingPayment = seedBooking({ sacrament: 'wedding', status: 'approved', paymentStatus: 'unpaid', userId: 'u1', appointmentDate: inDays(30), appointmentStart: '10:00' })
    seedBooking({ sacrament: 'wedding', status: 'submitted', userId: 'u1', appointmentDate: inDays(30), appointmentStart: '10:00' })
    expect((await fetchBooking(ok.id)).dayPass!.qrSvg).toContain('<svg')
    expect((await fetchBooking(awaitingPayment.id)).dayPass).toBeNull()
    const list = await fetchBookings('u1')
    expect(list.filter((b) => b.dayPass)).toHaveLength(1)
    expect(list.find((b) => b.dayPass)!.dayPass!.qrSvg).toBeUndefined()
  })

  it('stores a late document on a submitted or approved wedding and lists it for review', async () => {
    const w = seedBooking({ sacrament: 'wedding', status: 'approved', appointmentDate: inDays(30), appointmentStart: '10:00' })
    const updated = await attachLateDocument(w.id, 'preCanaCertificate', '/documents/u1/pc.pdf')
    expect(updated.status).toBe('approved')
    expect(updated.documents).toEqual([expect.objectContaining({ key: 'preCanaCertificate', url: '/documents/u1/pc.pdf', review: null })])
    expect((await fetchBooking(w.id)).formData.preCanaCertificate).toBe('/documents/u1/pc.pdf')
  })

  it('refuses a late document the way the server does', async () => {
    const done = seedBooking({ sacrament: 'wedding', status: 'completed' })
    const draft = seedBooking({ sacrament: 'wedding', status: 'draft' })
    const baptism = seedBooking({ sacrament: 'baptism', status: 'approved' })
    const open = seedBooking({ sacrament: 'wedding', status: 'submitted' })
    await expect(attachLateDocument(done.id, 'bannsCertificate', '/x.pdf')).rejects.toThrow('only while the booking is submitted or approved')
    await expect(attachLateDocument(draft.id, 'bannsCertificate', '/x.pdf')).rejects.toThrow('only while the booking is submitted or approved')
    await expect(attachLateDocument(baptism.id, 'bannsCertificate', '/x.pdf')).rejects.toThrow('only to a wedding booking')
    await expect(attachLateDocument(open.id, 'birthCertificate', '/x.pdf')).rejects.toThrow('Only the marriage license')
  })
})
