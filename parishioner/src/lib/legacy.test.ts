/// <reference types="node" />
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

// vitest runs with cwd = parishioner/ (import.meta.url is not a file: URL under jsdom).
const SRC = join(process.cwd(), 'src')
const BANNED = [/\bcreateBooking\b/, /\bupdateBooking\b/, /'rejected'/, /'pending'/, /\bfetchAvailabilityRange\b/, /\bSlotAvailability\b/, /\bcomputeBookingFee\b/, /\bPaymentMethodScreen\b/, /\bsetPaymentMethod\b/]

// 'rejected' was a booking status (now 'declined'). It is also, legitimately, staff's verdict on a
// document ('accepted' | 'rejected'); that meaning is allowed in the files that show it, and nowhere else.
const DOCUMENT_REVIEW_FILES = /(lib[\\/]types\.ts|documentState(\.test)?\.ts|DocumentStateLine\.tsx|DocumentsStep(\.test)?\.tsx|BookingDetailScreen(\.test)?\.tsx|PreparationCard\.test\.tsx)$/

// 'pending' was a booking status. It is also, legitimately, a payment state in the shared types.
const ID_STATUS_FILES = /(lib[\\/]types\.ts)$/

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) && !p.endsWith('legacy.test.ts') ? [p] : []
  })
}

describe('legacy booking contract is gone', () => {
  it('no source file references a removed name', () => {
    const offenders = files(SRC).filter((f) =>
      BANNED.some((re) => re.test(readFileSync(f, 'utf8')) && !(re.source === "'rejected'" && DOCUMENT_REVIEW_FILES.test(f))
        && !(re.source === "'pending'" && ID_STATUS_FILES.test(f))),
    )
    expect(offenders).toEqual([])
  })
})
