import type { Transition, Variants } from 'motion/react'

export const ease = [0.2, 0.7, 0.2, 1] as const
export const durations = { quick: 0.16, base: 0.24, slow: 0.42 } as const

export const fadeUp: Variants = {
  initial: { opacity: 1, y: 0 }, // content appears at once; only overlays and feedback animate
  animate: { opacity: 1, y: 0, transition: { duration: durations.base, ease: [...ease] } },
  exit: { opacity: 0, transition: { duration: durations.quick } },
}

/** Rows no longer stagger: lists appear at once. Kept so existing call sites stay valid. */
export function staggerDelay(_index: number): number {
  return 0
}

/** The journey rail fills one stage at a time, 90 ms apart. */
export const railFill = (index: number) => ({
  transition: { duration: durations.base, ease: [...ease], delay: index * 0.09 } satisfies Transition,
})

/** Button press feedback: scale to 0.98 over 120 ms. */
// `transform` as a full string, not the `scale` shorthand: on this Motion version the shorthand runs on the main thread and drops
// frames while a page is loading; a transform string is hardware-accelerated in every version.
// `rest` is the state a release returns to. Without it Motion animates back to `none`, which it reads as scale(0) and the button vanishes.
export const press = { scale: 0.98, transform: 'scale(0.98)', rest: 'scale(1)', transition: { duration: 0.12 } } as const

export const sheetSpring: Transition = { type: 'spring', stiffness: 380, damping: 36 }

/** With reduced motion on, every variant shows its final state at once. */
export function motionSafe(variants: Variants, reduced: boolean): Variants {
  if (!reduced) return variants
  const safe: Variants = {}
  for (const [key, value] of Object.entries(variants)) {
    if (typeof value === 'object' && value !== null && 'transition' in value) {
      safe[key] = { ...(value as object), transition: { duration: 0 } } as Variants[string]
    } else {
      safe[key] = value
    }
  }
  return safe
}
