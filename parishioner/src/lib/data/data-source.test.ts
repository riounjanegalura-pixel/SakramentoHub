import { describe, it, expect, vi, afterEach } from 'vitest'

describe('data source selection', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('uses the mock services module when VITE_API_URL is unset', async () => {
    vi.stubEnv('VITE_API_URL', '')
    const mock = await import('../mock/services')
    const { fetchServices } = await import('./services')
    expect(fetchServices).toBe(mock.fetchServices)
  })

  it('uses the api services module when VITE_API_URL is set', async () => {
    vi.stubEnv('VITE_API_URL', 'http://localhost:8000/api')
    vi.resetModules()
    const api = await import('../api/services')
    const { fetchServices } = await import('./services')
    expect(fetchServices).toBe(api.fetchServices)
  })
})
