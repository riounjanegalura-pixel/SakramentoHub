import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useSlowRequestNotice } from './useSlowRequestNotice'

describe('useSlowRequestNotice', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('stays false immediately, even while active', () => {
    const { result } = renderHook(() => useSlowRequestNotice(true, 3000))
    expect(result.current).toBe(false)
  })

  it('flips to true once the delay elapses while still active', () => {
    const { result } = renderHook(() => useSlowRequestNotice(true, 3000))

    act(() => {
      vi.advanceTimersByTime(3000)
    })

    expect(result.current).toBe(true)
  })

  it('resets to false as soon as isActive goes false (request finished before the delay)', () => {
    const { result, rerender } = renderHook(({ active }) => useSlowRequestNotice(active, 3000), {
      initialProps: { active: true },
    })

    act(() => {
      vi.advanceTimersByTime(1000)
    })
    rerender({ active: false })

    expect(result.current).toBe(false)
  })

  it('never fires if isActive is false the whole time', () => {
    const { result } = renderHook(() => useSlowRequestNotice(false, 3000))

    act(() => {
      vi.advanceTimersByTime(5000)
    })

    expect(result.current).toBe(false)
  })
})
