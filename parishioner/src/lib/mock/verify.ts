import { simulateLatency } from './latency'
import { ApiError } from '../api/client'
import type { CertificateVerification } from '../types'

const NOT_FOUND = 'No record found. Check the number and code on the certificate.'

const ENTRIES: Record<string, { code: string; result: CertificateVerification }> = {
  'BAP-2026-0001': {
    code: 'ABCDEFGHJKMN',
    result: {
      status: 'valid', parishName: 'St. Peter the Apostle Parish', sacrament: 'Baptism', registerNumber: 'BAP-2026-0001',
      subjectName: 'Maria Santos', ceremonyDate: '2026-10-05', minister: 'Fr. Jose Cruz', correctedOn: null,
    },
  },
  'BAP-2026-0002': {
    code: 'ABCDEFGHJKMN',
    result: {
      status: 'revoked', parishName: 'St. Peter the Apostle Parish', sacrament: 'Baptism', registerNumber: 'BAP-2026-0002',
      subjectName: 'Juan Dela Cruz', ceremonyDate: '2026-10-05', minister: 'Fr. Jose Cruz', correctedOn: null,
    },
  },
}

/** Same rules as the server: the number is trimmed and upper-cased, the code ignores case, spaces and dashes. */
export async function verifyCertificate(number: string, code: string): Promise<CertificateVerification> {
  await simulateLatency()
  const entry = ENTRIES[number.trim().toUpperCase()]
  const normalised = code.replace(/[\s-]/g, '').toUpperCase()
  if (!entry || entry.code !== normalised) throw new ApiError(NOT_FOUND, 404)
  return entry.result
}
