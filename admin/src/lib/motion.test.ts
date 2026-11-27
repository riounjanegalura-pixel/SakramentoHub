import { describe, expect, it } from 'vitest'
import { durations, ease, fadeUp, press, staggerDelay, motionSafe } from './motion'

describe('motion tokens', () => {
  it('uses the spec durations and one curve', () => {
    expect(durations).toEqual({ quick: 0.16, base: 0.24, slow: 0.42 })
    expect(ease).toEqual([0.2, 0.7, 0.2, 1])
  })

  it('no longer staggers rows: lists appear at once', () => {
    expect(staggerDelay(0)).toBe(0)
    expect(staggerDelay(7)).toBe(0)
    expect(staggerDelay(20)).toBe(0)
  })

  it('press is a 0.98 scale over 120 ms', () => {
    expect(press).toEqual({ scale: 0.98, transform: 'scale(0.98)', rest: 'scale(1)', transition: { duration: 0.12 } })
  })

  it('reduced motion returns instant variants', () => {
    const safe = motionSafe(fadeUp, true)
    expect(safe.animate).toEqual({ opacity: 1, y: 0, transition: { duration: 0 } })
  })

  it('reduced motion also zeroes the exit variant', () => {
    const safe = motionSafe(fadeUp, true)
    expect(safe.exit).toEqual({ opacity: 0, transition: { duration: 0 } })
    // the unreduced exit keeps its quick fade
    expect(motionSafe(fadeUp, false).exit).toEqual(fadeUp.exit)
  })
})
