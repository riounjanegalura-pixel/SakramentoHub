import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'

const KEY = 'sakramentohub_query_cache'

/** Remembers fetched data on this device so a repeat visit shows it at once
 *  while fresh data loads in the background. Wiped on sign-out. */
export const queryPersister = createSyncStoragePersister({
  storage: typeof window === 'undefined' ? undefined : window.localStorage,
  key: KEY,
  throttleTime: 1000,
})

export const PERSIST_MAX_AGE = 12 * 60 * 60 * 1000

export function clearPersistedQueries(): void {
  try {
    window.localStorage.removeItem(KEY)
  } catch {
    // Storage can be blocked (private window); nothing to clear then.
  }
}
