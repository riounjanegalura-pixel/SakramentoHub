import * as React from "react"
import { AnimatePresence, useReducedMotion, type Transition, type Variants } from "motion/react"
import { durations, ease, motionSafe, sheetSpring } from "@/lib/motion"

// Radix does not expose an overlay's open state to its parts, so each of our
// overlay roots (Dialog, Sheet, Popover, DropdownMenu, Tooltip) tracks it here
// and its content part reads it back. Content is force-mounted inside
// AnimatePresence, which keeps it in the tree until the exit has played.
// Only opacity and transform are animated.

const OverlayOpenContext = React.createContext(false)

export function OverlayOpenProvider({
  open,
  children,
}: {
  open: boolean
  children: React.ReactNode
}) {
  return (
    <OverlayOpenContext.Provider value={open}>
      {children}
    </OverlayOpenContext.Provider>
  )
}

export function useOverlayOpen(): boolean {
  return React.useContext(OverlayOpenContext)
}

type OpenState = {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
}

/** Controlled or uncontrolled open state, always handed to Radix as controlled. */
export function useOverlayState({ open, defaultOpen, onOpenChange }: OpenState) {
  const [internal, setInternal] = React.useState(defaultOpen ?? false)
  const isControlled = open !== undefined
  const current = isControlled ? open : internal
  const handleChange = React.useCallback(
    (next: boolean) => {
      if (!isControlled) setInternal(next)
      onOpenChange?.(next)
    },
    [isControlled, onOpenChange]
  )
  return { open: current, onOpenChange: handleChange }
}

/** Renders its children only while open, and keeps them until their exit has played. */
export function MotionOverlay({
  open,
  children,
}: {
  open: boolean
  children: React.ReactNode
}) {
  return <AnimatePresence>{open ? children : null}</AnimatePresence>
}

export type OverlayVariant = "fade" | "scale" | "pop" | "sheet"
export type OverlaySide = "top" | "right" | "bottom" | "left"

const curve: [number, number, number, number] = [...ease]
const enter: Transition = { duration: durations.base, ease: curve }
const leave: Transition = { duration: durations.quick, ease: curve }

function offscreen(side: OverlaySide) {
  switch (side) {
    case "right":
      return { x: "100%" }
    case "left":
      return { x: "-100%" }
    case "top":
      return { y: "-100%" }
    default:
      return { y: "100%" }
  }
}

function build(variant: OverlayVariant, side: OverlaySide): Variants {
  switch (variant) {
    case "fade":
      return {
        initial: { opacity: 0 },
        animate: { opacity: 1, transition: enter },
        exit: { opacity: 0, transition: leave },
      }
    case "scale": // centred dialog
      return {
        initial: { opacity: 0, scale: 0.97 },
        animate: { opacity: 1, scale: 1, transition: enter },
        exit: { opacity: 0, scale: 0.97, transition: leave },
      }
    case "pop": // popover, menu, select, tooltip
      return {
        initial: { opacity: 0, scale: 0.96 },
        animate: { opacity: 1, scale: 1, transition: enter },
        exit: { opacity: 0, scale: 0.96, transition: leave },
      }
    case "sheet": {
      const away = offscreen(side)
      const home = side === "left" || side === "right" ? { x: 0 } : { y: 0 }
      return {
        initial: away,
        animate: { ...home, transition: sheetSpring },
        exit: { ...away, transition: enter },
      }
    }
  }
}

/**
 * Props for an `m.div` that is the Radix part (asChild). Under reduced motion the
 * content mounts at its final state and leaves at once.
 */
export function useOverlayMotion(variant: OverlayVariant, side: OverlaySide = "right") {
  const reduced = useReducedMotion() ?? false
  const variants = React.useMemo(
    () => motionSafe(build(variant, side), reduced),
    [variant, side, reduced]
  )
  return {
    variants,
    initial: reduced ? (false as const) : ("initial" as const),
    animate: "animate" as const,
    exit: "exit" as const,
  }
}
