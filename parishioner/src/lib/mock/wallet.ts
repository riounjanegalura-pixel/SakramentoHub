import { simulateLatency, simulateFailure, getFailureRate } from './latency'
import type { WalletDocument, WalletKind } from '../types'

/** Mock counterpart to lib/api/wallet.ts: the wallet lives in memory and starts empty. */
let wallet: WalletDocument[] = []
let nextId = 1

export const WALLET_LIMIT = 30
export const WALLET_FULL_MESSAGE = 'Your wallet is full (30 documents). Delete one to add another.'

/** Test helper: back to an empty wallet. */
export function resetMockWallet(): void {
  wallet = []
  nextId = 1
}

async function guard(message: string): Promise<void> {
  await simulateLatency()
  if (simulateFailure(getFailureRate())) throw new Error(message)
}

export async function fetchWallet(): Promise<WalletDocument[]> {
  await guard('Failed to load wallet')
  return [...wallet]
}

function insert(fileUrl: string, originalName: string, mime: string, sizeBytes: number, kind: WalletKind, personName: string): WalletDocument {
  const row: WalletDocument = {
    id: `wallet-${nextId++}`, kind, personName, fileUrl, originalName, mime, sizeBytes, createdAt: new Date().toISOString(),
  }
  wallet = [row, ...wallet]
  return row
}

export async function addWalletDocumentFile(file: File, kind: WalletKind, personName: string): Promise<WalletDocument> {
  await guard('Failed to add document')
  if (wallet.length >= WALLET_LIMIT) throw new Error(WALLET_FULL_MESSAGE)
  const url = typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : `mock://${file.name}`
  return insert(url, file.name, file.type || 'application/octet-stream', file.size, kind, personName)
}

export async function addWalletDocumentByUrl(fileUrl: string, kind: WalletKind, personName: string): Promise<WalletDocument> {
  await guard('Failed to add document')
  const existing = wallet.find((d) => d.fileUrl === fileUrl)
  if (existing) return existing
  if (wallet.length >= WALLET_LIMIT) throw new Error(WALLET_FULL_MESSAGE)
  return insert(fileUrl, decodeURIComponent(fileUrl.split('/').pop() ?? 'document'), 'application/octet-stream', 0, kind, personName)
}

export async function deleteWalletDocument(id: string): Promise<void> {
  await guard('Failed to delete document')
  wallet = wallet.filter((d) => d.id !== id)
}
