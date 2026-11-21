// The admin portal has no mock data layer (unlike parishioner/lib/data,
// which still branches on VITE_API_URL) — this app only ever talks to the
// real API, so these facades just re-export lib/api directly. Kept as a
// separate module anyway so screens import from lib/data, matching
// parishioner's convention and keeping room for a mock swap later.
export * from '../api/auth'
