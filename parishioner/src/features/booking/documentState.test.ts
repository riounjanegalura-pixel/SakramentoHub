import { describe, it, expect } from 'vitest'
import { documentState } from './documentState'
import type { BookingDocument } from '../../lib/types'

const doc = (over: Partial<BookingDocument> = {}): BookingDocument => ({
  key: 'deathCertificate', label: 'death certificate', required: true, url: '/documents/u1/a.pdf', review: null, ...over,
})
const review = (status: 'accepted' | 'rejected', note: string | null = null) => ({ status, note, reviewedAt: '2026-11-02T01:00:00Z' })

describe('documentState', () => {
  it('is missing when nothing is uploaded', () => {
    expect(documentState(doc({ url: null }))).toEqual({ kind: 'missing' })
  })
  it('is waiting when uploaded and not reviewed', () => {
    expect(documentState(doc())).toEqual({ kind: 'waiting' })
  })
  it('reflects an accepted and a rejected review', () => {
    expect(documentState(doc({ review: review('accepted') }))).toEqual({ kind: 'accepted' })
    expect(documentState(doc({ review: review('rejected', 'Blurry') }))).toEqual({ kind: 'rejected', note: 'Blurry' })
  })
  it('is replaced when the form holds a different file than the reviewed one', () => {
    expect(documentState(doc({ review: review('rejected', 'Blurry') }), '/documents/u1/b.pdf')).toEqual({ kind: 'replaced' })
    expect(documentState(doc({ url: null }), '/documents/u1/b.pdf')).toEqual({ kind: 'replaced' })
  })
  it('keeps the review while the form still holds the same file', () => {
    expect(documentState(doc({ review: review('rejected', 'Blurry') }), '/documents/u1/a.pdf')).toEqual({ kind: 'rejected', note: 'Blurry' })
  })
})
