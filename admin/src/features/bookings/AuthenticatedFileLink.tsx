import { useAuthenticatedBlobUrl } from '../../lib/hooks/useAuthenticatedBlobUrl'

/** The path a document endpoint returns requires the Authorization
 * header this app's client attaches (private disk, ownership-gated — see
 * docs/api-contract.md) — a plain <a href> can't send that, so this
 * fetches it properly and renders a blob: URL once it's ready. */
export function AuthenticatedFileLink({ path, label }: { path: string; label: string }) {
  const { blobUrl, isLoading, error } = useAuthenticatedBlobUrl(path)

  if (isLoading) return <span className="text-sm text-ink-muted">Loading…</span>
  if (error || !blobUrl) return <span className="text-sm text-danger">Couldn&apos;t load file.</span>

  return (
    <a href={blobUrl} target="_blank" rel="noreferrer" className="font-medium text-navy underline">
      {label}
    </a>
  )
}
