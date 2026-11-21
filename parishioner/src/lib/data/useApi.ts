/**
 * Whether data calls should hit the real backend instead of the in-memory
 * mock layer. Every file in lib/data/ switches on this single flag instead
 * of each recomputing its own — so the safety check below only has to exist
 * once, not in all 7 call sites.
 *
 * Guards the demo-breaking failure mode: a production build shipped with
 * VITE_API_URL unset or misspelled would otherwise boot happily against
 * localStorage mock data — login "works", bookings "submit" — with zero
 * visible sign nothing ever reaches the real backend (see
 * docs/system-qa-report.md). In a DEV build, omitting VITE_API_URL on
 * purpose to run against the mock layer is a supported, documented workflow
 * (see docs/DEPLOYMENT.md's "Local dev" section), so this only throws in a
 * PROD build, where a missing URL can only be a mistake, never a choice.
 */
export const useApi = (() => {
  const url = import.meta.env.VITE_API_URL
  if (!url && import.meta.env.PROD) {
    throw new Error(
      'VITE_API_URL is not set in this production build. Without it, the app would ' +
        'silently run entirely on fake mock data with no visible indication — set ' +
        'VITE_API_URL in the deployment environment and rebuild.',
    )
  }
  return !!url
})()
