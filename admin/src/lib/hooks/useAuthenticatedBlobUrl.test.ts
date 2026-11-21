import { renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useAuthenticatedBlobUrl } from './useAuthenticatedBlobUrl'
import * as client from '../api/client'

describe('useAuthenticatedBlobUrl', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:mock-url'),
      revokeObjectURL: vi.fn(),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // Regression test for the hole where uploaded documents were served from
  // an unauthenticated public disk — this hook is what lets a private,
  // Bearer-token-gated endpoint still be rendered in an <img>/<a>.
  it('fetches the path WITH auth (via apiFetchBlob) and returns a usable blob url', async () => {
    const fetchSpy = vi.spyOn(client, 'apiFetchBlob').mockResolvedValue(new Blob(['x']))

    const { result } = renderHook(() => useAuthenticatedBlobUrl('/documents/u1/abc123.jpg'))

    expect(result.current.isLoading).toBe(true)

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(fetchSpy).toHaveBeenCalledWith('/documents/u1/abc123.jpg')
    expect(result.current.blobUrl).toBe('blob:mock-url')
    expect(result.current.error).toBeNull()
  })

  it('reports the real type, and falls back to the extension when the server sent none', async () => {
    vi.spyOn(client, 'apiFetchBlob').mockResolvedValueOnce(new Blob(['x'], { type: 'application/pdf' }))
    const typed = renderHook(() => useAuthenticatedBlobUrl('/documents/u1/noext'))
    await waitFor(() => expect(typed.result.current.isLoading).toBe(false))
    expect(typed.result.current.contentType).toBe('application/pdf')

    vi.spyOn(client, 'apiFetchBlob').mockResolvedValueOnce(new Blob(['x']))
    const untyped = renderHook(() => useAuthenticatedBlobUrl('/documents/u1/birth.pdf'))
    await waitFor(() => expect(untyped.result.current.isLoading).toBe(false))
    expect(untyped.result.current.contentType).toBe('application/pdf')
  })

  it('returns nothing loading when path is null', () => {
    const { result } = renderHook(() => useAuthenticatedBlobUrl(null))

    expect(result.current).toEqual({ blobUrl: null, contentType: null, isLoading: false, error: null })
  })

  it('surfaces a real fetch error instead of silently showing nothing', async () => {
    vi.spyOn(client, 'apiFetchBlob').mockRejectedValue(new Error('Request failed: 403'))

    const { result } = renderHook(() => useAuthenticatedBlobUrl('/documents/u1/f.jpg'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.error).toBe('Request failed: 403')
    expect(result.current.blobUrl).toBeNull()
  })

  it('revokes the previous blob url when the path changes', async () => {
    vi.spyOn(client, 'apiFetchBlob').mockResolvedValue(new Blob(['x']))
    const { result, rerender } = renderHook(({ path }) => useAuthenticatedBlobUrl(path), {
      initialProps: { path: '/documents/u1/a.jpg' as string | null },
    })

    await waitFor(() => expect(result.current.blobUrl).toBe('blob:mock-url'))

    rerender({ path: '/documents/u1/b.jpg' })

    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url'))
  })
})
