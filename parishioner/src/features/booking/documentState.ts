import type { BookingDocument } from '../../lib/types'

export type DocumentState =
  | { kind: 'missing' }
  | { kind: 'replaced' }
  | { kind: 'waiting' }
  | { kind: 'accepted' }
  | { kind: 'rejected'; note: string | null }

/**
 * Where one document stands. `current` is the file the wizard form holds now; leave it out
 * on the detail screen. A different file than the reviewed one counts as replaced: the
 * server drops the old review the moment the new file is saved.
 */
export function documentState(doc: BookingDocument, current?: unknown): DocumentState {
  const value = typeof current === 'string' && current !== '' ? current : doc.url
  if (!value) return { kind: 'missing' }
  if (value !== doc.url) return { kind: 'replaced' }
  if (!doc.review) return { kind: 'waiting' }
  return doc.review.status === 'accepted' ? { kind: 'accepted' } : { kind: 'rejected', note: doc.review.note }
}
