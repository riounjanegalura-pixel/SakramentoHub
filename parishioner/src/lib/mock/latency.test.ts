import { describe, it, expect, vi } from 'vitest'
import { simulateLatency, simulateFailure } from './latency'

describe('simulateLatency', () => {
  it('resolves after roughly the given delay', async () => {
    vi.useFakeTimers()
    const promise = simulateLatency(500)
    vi.advanceTimersByTime(500)
    await expect(promise).resolves.toBeUndefined()
    vi.useRealTimers()
  })

  it('defaults to a delay within the 300-800ms latency window', async () => {
    vi.useFakeTimers()
    const promise = simulateLatency()
    vi.advanceTimersByTime(800)
    await expect(promise).resolves.toBeUndefined()
    vi.useRealTimers()
  })

  it('does not resolve before the given delay has elapsed', async () => {
    vi.useFakeTimers()
    let resolved = false
    void simulateLatency(500).then(() => {
      resolved = true
    })
    vi.advanceTimersByTime(499)
    await Promise.resolve()
    expect(resolved).toBe(false)
    vi.advanceTimersByTime(1)
    await Promise.resolve()
    expect(resolved).toBe(true)
    vi.useRealTimers()
  })
})

describe('simulateFailure', () => {
  it('always returns false at rate 0', () => {
    expect(simulateFailure(0)).toBe(false)
  })
  it('always returns true at rate 1', () => {
    expect(simulateFailure(1)).toBe(true)
  })
})
