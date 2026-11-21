import { describe, it, expect, vi, afterEach } from 'vitest'

// Regression test for the demo-breaking bug where a production build with
// VITE_API_URL missing/misspelled silently ran entirely on fake mock data —
// login "worked", bookings "submitted", nothing ever reached the real
// backend, with zero visible sign anything was wrong (see
// docs/system-qa-report.md). Every lib/data/*.ts file now imports this one
// flag instead of computing its own, so the safety check only needs proving
// once.
describe('useApi', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('throws in a production build when VITE_API_URL is missing', async () => {
    vi.stubEnv('PROD', true)
    vi.stubEnv('VITE_API_URL', '')

    await expect(import('./useApi')).rejects.toThrow(/VITE_API_URL is not set/)
  })

  it('does not throw in a dev build when VITE_API_URL is missing — the documented mock-mode workflow', async () => {
    vi.stubEnv('PROD', false)
    vi.stubEnv('VITE_API_URL', '')

    const { useApi } = await import('./useApi')
    expect(useApi).toBe(false)
  })

  it('is true whenever VITE_API_URL is set, dev or prod', async () => {
    vi.stubEnv('PROD', true)
    vi.stubEnv('VITE_API_URL', 'https://api.example.com')

    const { useApi } = await import('./useApi')
    expect(useApi).toBe(true)
  })
})
