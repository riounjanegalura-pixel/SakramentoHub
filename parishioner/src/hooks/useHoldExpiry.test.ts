import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useHoldExpiry } from './useHoldExpiry'

describe('useHoldExpiry', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-02T00:00:00Z'))
  })
  afterEach(() => vi.useRealTimers())

  it('re-renders and calls back once the hold runs out', () => {
    const onExpire = vi.fn()
    let renders = 0
    renderHook(() => {
      renders++
      useHoldExpiry(['2026-11-02T00:00:10Z'], onExpire)
    })
    const before = renders

    act(() => { vi.advanceTimersByTime(9_000) })
    expect(onExpire).not.toHaveBeenCalled()

    act(() => { vi.advanceTimersByTime(2_000) })
    expect(onExpire).toHaveBeenCalledTimes(1)
    expect(renders).toBeGreaterThan(before)
  })

  it('moves on to the next hold, earliest first', () => {
    const onExpire = vi.fn()
    renderHook(() => useHoldExpiry(['2026-11-02T00:00:20Z', null, '2026-11-02T00:00:10Z'], onExpire))
    act(() => { vi.advanceTimersByTime(11_000) })
    expect(onExpire).toHaveBeenCalledTimes(1)
    act(() => { vi.advanceTimersByTime(10_000) })
    expect(onExpire).toHaveBeenCalledTimes(2)
  })

  it('does nothing for missing or already-past instants', () => {
    const onExpire = vi.fn()
    renderHook(() => useHoldExpiry([null, undefined, '2020-01-01T00:00:00Z'], onExpire))
    expect(vi.getTimerCount()).toBe(0)
    expect(onExpire).not.toHaveBeenCalled()
  })

  it('never sets a timer longer than the browser allows, and keeps waiting', () => {
    const onExpire = vi.fn()
    renderHook(() => useHoldExpiry(['2026-12-31T00:00:00Z'], onExpire)) // ~59 days out
    act(() => { vi.advanceTimersByTime(25 * 86_400_000) })
    expect(onExpire).toHaveBeenCalledTimes(1) // woke at the cap, harmlessly
    expect(vi.getTimerCount()).toBe(1) // and is waiting again
  })

  it('stops when the component unmounts', () => {
    const onExpire = vi.fn()
    const { unmount } = renderHook(() => useHoldExpiry(['2026-11-02T00:00:10Z'], onExpire))
    unmount()
    act(() => { vi.advanceTimersByTime(60_000) })
    expect(onExpire).not.toHaveBeenCalled()
  })
})
