import { simulateLatency, simulateFailure, getFailureRate } from './latency'
import type { RegisterEntrySummary } from '../types'

/** The mock has no completed sacraments, so the certificate list starts empty. */
const entries: RegisterEntrySummary[] = []

export async function fetchMyRegisterEntries(): Promise<RegisterEntrySummary[]> {
  await simulateLatency()
  if (simulateFailure(getFailureRate())) throw new Error('Failed to load certificates')
  return [...entries]
}

export async function fetchRegisterEntryCertificateHtml(id: string): Promise<string> {
  await simulateLatency()
  if (simulateFailure(getFailureRate())) throw new Error('Failed to load certificate')
  const entry = entries.find((e) => e.id === id)
  if (!entry) throw new Error('Certificate not found.')
  return `<html><body><h1>Certificate ${entry.registerNumber}</h1></body></html>`
}
