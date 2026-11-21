import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useIsDesktop } from './useIsDesktop'
import { setViewport } from '../test/viewport'

const original = window.matchMedia

describe('useIsDesktop', () => {
  afterEach(() => {
    window.matchMedia = original
  })

  it('is false when matchMedia does not exist (jsdom default)', () => {
    // @ts-expect-error simulate an environment without matchMedia
    window.matchMedia = undefined
    expect(renderHook(() => useIsDesktop()).result.current).toBe(false)
  })

  it('is false at 1023 px and true at 1024 px', () => {
    setViewport(1023)
    expect(renderHook(() => useIsDesktop()).result.current).toBe(false)
    setViewport(1024)
    expect(renderHook(() => useIsDesktop()).result.current).toBe(true)
  })

  it('removes the listener it added when it unmounts', () => {
    const add = vi.fn()
    const remove = vi.fn()
    window.matchMedia = (() => ({ matches: false, media: '', addEventListener: add, removeEventListener: remove })) as unknown as typeof window.matchMedia
    const { unmount } = renderHook(() => useIsDesktop())
    expect(add).toHaveBeenCalledTimes(1)
    unmount()
    expect(remove).toHaveBeenCalledTimes(1)
    expect(remove.mock.calls[0][1]).toBe(add.mock.calls[0][1])
  })

  it('follows a resize', () => {
    const vp = setViewport(800)
    const { result } = renderHook(() => useIsDesktop())
    expect(result.current).toBe(false)
    act(() => vp.resize(1280))
    expect(result.current).toBe(true)
    act(() => vp.resize(500))
    expect(result.current).toBe(false)
  })
})
