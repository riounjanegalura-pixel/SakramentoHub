import * as React from "react"
import { cn } from "@/lib/utils"
import * as m from "motion/react-m"
import { Tooltip as TooltipPrimitive } from "radix-ui"

import {
  MotionOverlay,
  OverlayOpenProvider,
  useOverlayMotion,
  useOverlayOpen,
  useOverlayState,
} from "@/components/ui/motion-overlay"

function TooltipProvider({
  delayDuration = 0,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      {...props}
    />
  )
}

function Tooltip({
  open,
  defaultOpen,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  const state = useOverlayState({ open, defaultOpen, onOpenChange })
  return (
    <OverlayOpenProvider open={state.open}>
      <TooltipPrimitive.Root
        data-slot="tooltip"
        open={state.open}
        onOpenChange={state.onOpenChange}
        {...props}
      />
    </OverlayOpenProvider>
  )
}

function TooltipTrigger({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

function TooltipContent({
  className,
  sideOffset = 0,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  const open = useOverlayOpen()
  const motionProps = useOverlayMotion("pop")
  return (
    <MotionOverlay open={open}>
      <TooltipPrimitive.Portal forceMount>
        <TooltipPrimitive.Content
          asChild
          forceMount
          sideOffset={sideOffset}
          {...props}
        >
          <m.div
            data-slot="tooltip-content"
            className={cn(
              "z-50 w-fit origin-(--radix-tooltip-content-transform-origin) rounded-md bg-foreground px-3 py-1.5 text-label text-balance text-background",
              className
            )}
            {...motionProps}
          >
            {children}
            <TooltipPrimitive.Arrow className="z-50 size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px] bg-foreground fill-foreground" />
          </m.div>
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </MotionOverlay>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
