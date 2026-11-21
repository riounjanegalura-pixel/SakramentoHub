import type { WalletKind } from '../../lib/types'

export const WALLET_LIMIT = 30

export const KIND_LABEL: Record<WalletKind, string> = {
  birth_certificate: 'Birth certificate',
  baptismal_certificate: 'Baptismal certificate',
  confirmation_certificate: 'Confirmation certificate',
  marriage_contract: 'Marriage contract',
  cenomar: 'CENOMAR',
  death_certificate: 'Death certificate',
  other: 'Other',
}

export const KINDS = Object.keys(KIND_LABEL) as WalletKind[]

/** "Oct 5, 2026", in parish time whatever the device's zone. */
export function formatAdded(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' })
}

/** Kinds a parish usually wants issued recently when they support a wedding. */
export const FRESH_COPY_KINDS: readonly WalletKind[] = ['baptismal_certificate', 'confirmation_certificate', 'cenomar']

export function olderThanSixMonths(iso: string, now = new Date()): boolean {
  const cutoff = new Date(now)
  cutoff.setMonth(cutoff.getMonth() - 6)
  return new Date(iso) < cutoff
}

/** Opens a Blob in a new tab (the file needs the bearer token, so a plain link would not work). */
export function openBlob(blob: Blob): void {
  window.open(URL.createObjectURL(blob), '_blank', 'noopener,noreferrer')
}

export function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}
