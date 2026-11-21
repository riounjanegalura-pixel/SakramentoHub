import { useEffect, useState } from 'react'
import { apiFetchBlob } from '../api/client'

interface AuthenticatedBlobUrlState {
  blobUrl: string | null
  /** The file's real MIME type ("application/pdf"), or null while loading or on error. */
  contentType: string | null
  isLoading: boolean
  error: string | null
}

const TYPE_BY_EXTENSION: Record<string, string> = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' }

/** The blob as the browser should treat it: when the server sent no usable type, fall back to the file extension. */
function withKnownType(blob: Blob, path: string): Blob {
  if (blob.type && blob.type !== 'application/octet-stream') return blob
  const type = TYPE_BY_EXTENSION[path.split('?')[0].split('.').pop()?.toLowerCase() ?? '']
  return type ? new Blob([blob], { type }) : blob
}

/** Fetches a private file (a prerequisite document) with the
 * Authorization header the backend now requires for these, and hands back a
 * blob: URL an <img src> or <a href> can actually use — a plain element
 * attribute can't attach that header itself.
 *
 * `path` is the relative API path the backend returns (e.g.
 * `/documents/{userId}/{filename}`), or null/undefined when there's nothing to
 * fetch yet. Revokes the previous blob URL on path change/unmount so this
 * doesn't leak memory across a session reviewing many bookings. */
export function useAuthenticatedBlobUrl(path: string | null | undefined): AuthenticatedBlobUrlState {
  const [state, setState] = useState<AuthenticatedBlobUrlState>({
    blobUrl: null,
    contentType: null,
    isLoading: !!path,
    error: null,
  })

  useEffect(() => {
    if (!path) {
      setState({ blobUrl: null, contentType: null, isLoading: false, error: null })
      return
    }

    let cancelled = false
    let objectUrl: string | null = null
    setState({ blobUrl: null, contentType: null, isLoading: true, error: null })

    apiFetchBlob(path)
      .then((fetched) => {
        if (cancelled) return
        const blob = withKnownType(fetched, path)
        objectUrl = URL.createObjectURL(blob)
        setState({ blobUrl: objectUrl, contentType: blob.type || null, isLoading: false, error: null })
      })
      .catch((err: Error) => {
        if (cancelled) return
        setState({ blobUrl: null, contentType: null, isLoading: false, error: err.message })
      })

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [path])

  return state
}
