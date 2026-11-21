"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { XIcon } from "lucide-react"
import * as m from "motion/react-m"
import { Dialog as SheetPrimitive } from "radix-ui"

import {
  MotionOverlay,
  OverlayOpenProvider,
  useOverlayMotion,
  useOverlayOpen,
  useOverlayState,
} from "@/components/ui/motion-overlay"

function Sheet({
  open,
  defaultOpen,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Root>) {
  const state = useOverlayState({ open, defaultOpen, onOpenChange })
  return (
    <OverlayOpenProvider open={state.open}>
      <SheetPrimitive.Root
        data-slot="sheet"
        open={state.open}
        onOpenChange={state.onOpenChange}
        {...props}
      />
    </OverlayOpenProvider>
  )
}

function SheetTrigger({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetPortal({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  const motionProps = useOverlayMotion("fade")
  return (
    <SheetPrimitive.Overlay asChild forceMount {...props}>
      <m.div
        data-slot="sheet-overlay"
        className={cn("fixed inset-0 z-50 bg-black/50", className)}
        {...motionProps}
      />
    </SheetPrimitive.Overlay>
  )
}

function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: "top" | "right" | "bottom" | "left"
  showCloseButton?: boolean
}) {
  const open = useOverlayOpen()
  const motionProps = useOverlayMotion("sheet", side)
  return (
    <MotionOverlay open={open}>
      <SheetPortal forceMount>
        <SheetOverlay />
        <SheetPrimitive.Content asChild forceMount {...props}>
          <m.div
            data-slot="sheet-content"
            className={cn(
              "fixed z-50 flex flex-col gap-4 bg-surface shadow-lg",
              side === "right" &&
                "inset-y-0 right-0 h-full w-3/4 border-l sm:max-w-sm",
              side === "left" &&
                "inset-y-0 left-0 h-full w-3/4 border-r sm:max-w-sm",
              side === "top" && "inset-x-0 top-0 h-auto border-b",
              side === "bottom" && "inset-x-0 bottom-0 h-auto border-t",
              className
            )}
            {...motionProps}
          >
            {children}
            {showCloseButton && (
              <SheetPrimitive.Close className="absolute top-1 right-1 inline-flex size-11 items-center justify-center rounded-xl opacity-70 hover:opacity-100 outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:pointer-events-none data-[state=open]:text-ink-muted [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4">
                <XIcon className="size-4" />
                <span className="sr-only">Close</span>
              </SheetPrimitive.Close>
            )}
          </m.div>
        </SheetPrimitive.Content>
      </SheetPortal>
    </MotionOverlay>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-1.5 p-4", className)}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  )
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn("font-semibold text-foreground", className)}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
