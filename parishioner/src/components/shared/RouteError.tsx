import { AlertCircle, RefreshCw } from 'lucide-react'
import { useRouteError } from 'react-router-dom'
import { Button } from '../ui/button'
import { ResultMark } from './ResultMark'

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
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col items-center justify-center gap-4 bg-paper p-6 text-center">
      <ResultMark tone={stale ? 'wait' : 'stop'} icon={stale ? RefreshCw : AlertCircle} />
      <h1 className="font-display text-title font-semibold text-navy">
        {stale ? 'This page could not load' : 'Something went wrong'}
      </h1>
      <p role="alert" className="text-body text-ink-muted">
        {stale ? 'The app was updated. Reload to get the latest version.' : 'Reload to try again.'}
      </p>
      <Button type="button" size="lg" onClick={() => window.location.reload()} className="w-full">
        Reload
      </Button>
    </div>
  )
}
