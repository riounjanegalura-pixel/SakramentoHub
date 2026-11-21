import { simulateLatency, simulateFailure, getFailureRate } from './latency'
import { ApiError } from '../api/client'
import type { CertificateRequest, CertificateRequestInput } from '../types'

/** Mock counterpart to lib/api/certificateRequests.ts: requests live in memory, newest first. */
let requests: CertificateRequest[] = []
let nextId = 1

export const OPEN_REQUEST_LIMIT = 5
export const OPEN_LIMIT_MESSAGE = `You already have ${OPEN_REQUEST_LIMIT} open requests.`
export const NOT_WAITING_MESSAGE = 'Only a request that is still waiting can be cancelled.'

/** Test helper: back to no requests. */
export function resetMockCertificateRequests(): void {
  requests = []
  nextId = 1
}

async function guard(message: string): Promise<void> {
  await simulateLatency()
  if (simulateFailure(getFailureRate())) throw new Error(message)
}

function reference(): string {
  const day = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }).replace(/-/g, '')
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 4; i++) code += letters[Math.floor(Math.random() * letters.length)]
  return `CERT-${day}-${code}`
}

export async function fetchMyCertificateRequests(): Promise<CertificateRequest[]> {
  await guard('Failed to load requests')
  return [...requests]
}

export async function createCertificateRequest(input: CertificateRequestInput): Promise<CertificateRequest> {
  await guard('Failed to send the request')
  if (requests.filter((r) => r.status === 'submitted').length >= OPEN_REQUEST_LIMIT) throw new ApiError(OPEN_LIMIT_MESSAGE, 422)
  if (input.relationship === 'representative' && !input.letterUrl) {
    throw new ApiError('The given data was invalid.', 422, { letterUrl: ['Add the authorisation letter.'] })
  }
  const row: CertificateRequest = {
    id: `cert-${nextId++}`,
    referenceNumber: reference(),
    sacrament: input.sacrament,
    personName: input.personName ?? 'Name from the register',
    sacramentDateText: input.sacramentDateText ?? '',
    details: {
      fatherName: input.details?.fatherName ?? null,
      motherName: input.details?.motherName ?? null,
      spouseName: input.details?.spouseName ?? null,
    },
    relationship: input.relationship,
    purpose: input.purpose,
    status: 'submitted',
    declineReason: null,
    registerEntry: null,
    createdAt: new Date().toISOString(),
    closedAt: null,
  }
  requests = [row, ...requests]
  return row
}

export async function cancelCertificateRequest(id: string): Promise<CertificateRequest> {
  await guard('Failed to cancel the request')
  const found = requests.find((r) => r.id === id)
  if (!found) throw new ApiError('Request not found.', 404)
  if (found.status !== 'submitted') throw new ApiError(NOT_WAITING_MESSAGE, 422)
  const updated: CertificateRequest = { ...found, status: 'cancelled', closedAt: new Date().toISOString() }
  requests = requests.map((r) => (r.id === id ? updated : r))
  return updated
}
