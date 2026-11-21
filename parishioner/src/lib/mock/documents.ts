import { simulateLatency, simulateFailure, getFailureRate } from './latency'

/** Mock counterpart to lib/api/documents.ts — an object URL stands in for a
 * real stored file. */
export async function uploadDocument(file: File): Promise<{ url: string }> {
  await simulateLatency()
  if (simulateFailure(getFailureRate())) throw new Error('Failed to upload document')
  return { url: URL.createObjectURL(file) }
}

/** An upload here is an object URL; anything else (a seeded address) has no bytes behind it. */
export async function fetchDocumentFile(url: string): Promise<Blob> {
  await simulateLatency()
  if (url.startsWith('blob:')) {
    try {
      return await (await fetch(url)).blob()
    } catch {
      /* fall through */
    }
  }
  return new Blob(['Sample document'], { type: 'text/plain' })
}
