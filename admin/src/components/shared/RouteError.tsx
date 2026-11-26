import { useRouteError } from 'react-router-dom'

/** A stale tab asking for a chunk that a redeploy removed, or a network failure while loading one. */
const CHUNK_ERROR = /dynamically imported module|Importing a module script failed|Failed to fetch/i

function isChunkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
  return CHUNK_ERROR.test(message)
}

/** Shown when a route fails: a stale chunk gets the update text, anything else a generic one. */
export function RouteError() {
  const stale = isChunkError(useRouteError())
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col items-center justify-center gap-4 bg-surface p-6 text-center">
      <h1 className="text-xl font-bold text-ink">
        {stale ? 'This page could not load' : 'Something went wrong'}
      </h1>
      <p role="alert" className="text-sm text-ink-muted">
        {stale ? 'The app was updated. Reload to get the latest version.' : 'Reload to try again.'}
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="min-h-11 rounded-xl bg-navy px-5 text-body font-semibold text-white hover:bg-navy-deep"
      >
        Reload
      </button>
    </div>
  )
}
