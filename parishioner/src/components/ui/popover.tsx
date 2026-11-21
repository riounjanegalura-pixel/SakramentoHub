import * as React from "react"
import { cn } from "@/lib/utils"
import * as m from "motion/react-m"
import { Popover as PopoverPrimitive } from "radix-ui"

import {
  MotionOverlay,
  OverlayOpenProvider,
  useOverlayMotion,
  useOverlayOpen,
  useOverlayState,
} from "@/components/ui/motion-overlay"

function Popover({
  open,
  defaultOpen,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  const state = useOverlayState({ open, defaultOpen, onOpenChange })
  return (
    <OverlayOpenProvider open={state.open}>
      <PopoverPrimitive.Root
        data-slot="popover"
        open={state.open}
        onOpenChange={state.onOpenChange}
        {...props}
      />
    </OverlayOpenProvider>
  )
}

function PopoverTrigger({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

function PopoverContent({
  className,
  align = "center",
  sideOffset = 4,
  children,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  const open = useOverlayOpen()
  const motionProps = useOverlayMotion("pop")
  return (
    <MotionOverlay open={open}>
      <PopoverPrimitive.Portal forceMount>
        <PopoverPrimitive.Content
          asChild
          forceMount
          align={align}
          sideOffset={sideOffset}
          {...props}
        >
          <m.div
            data-slot="popover-content"
            className={cn(
              "z-50 w-72 origin-(--radix-popover-content-transform-origin) rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-hidden",
              className
            )}
            {...motionProps}
          >
            {children}
          </m.div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </MotionOverlay>
  )
}

function PopoverAnchor({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />
}

function PopoverHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="popover-header"
      className={cn("flex flex-col gap-1 text-sm", className)}
      {...props}
    />
  )
}

function PopoverTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <div
      data-slot="popover-title"
      className={cn("font-medium", className)}
      {...props}
    />
  )
}

function PopoverDescription({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="popover-description"
      className={cn("text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverAnchor,
  PopoverHeader,
  PopoverTitle,
  PopoverDescription,
}
