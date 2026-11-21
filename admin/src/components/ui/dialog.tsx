import * as React from "react"
import { cn } from "@/lib/utils"
import { XIcon } from "lucide-react"
import * as m from "motion/react-m"
import { Dialog as DialogPrimitive } from "radix-ui"

import { Button } from "@/components/ui/button"
import {
  MotionOverlay,
  OverlayOpenProvider,
  useOverlayMotion,
  useOverlayOpen,
  useOverlayState,
} from "@/components/ui/motion-overlay"

function Dialog({
  open,
  defaultOpen,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  const state = useOverlayState({ open, defaultOpen, onOpenChange })
  return (
    <OverlayOpenProvider open={state.open}>
      <DialogPrimitive.Root
        data-slot="dialog"
        open={state.open}
        onOpenChange={state.onOpenChange}
        {...props}
      />
    </OverlayOpenProvider>
  )
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  const motionProps = useOverlayMotion("fade")
  return (
    <DialogPrimitive.Overlay asChild forceMount {...props}>
      <m.div
        data-slot="dialog-overlay"
        className={cn("fixed inset-0 z-50 bg-black/50", className)}
        {...motionProps}
      />
    </DialogPrimitive.Overlay>
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
}) {
  const open = useOverlayOpen()
  const motionProps = useOverlayMotion("scale")
  return (
    <MotionOverlay open={open}>
      <DialogPortal data-slot="dialog-portal" forceMount>
        <DialogOverlay />
        <DialogPrimitive.Content asChild forceMount {...props}>
          <m.div
            data-slot="dialog-content"
            className={cn(
              // Centred with auto margins, not a translate, so the scale animation owns the transform.
              "fixed inset-0 z-50 m-auto grid h-fit max-h-[calc(100%-2rem)] w-full max-w-[calc(100%-2rem)] gap-4 overflow-y-auto rounded-2xl border bg-surface p-6 shadow-lg outline-none sm:max-w-lg",
              className
            )}
            {...motionProps}
          >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            className="absolute top-1 right-1 inline-flex size-11 items-center justify-center rounded-xl opacity-70 hover:opacity-100 outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:pointer-events-none data-[state=open]:text-ink-muted [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
          </m.div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </MotionOverlay>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <Button variant="outline">Close</Button>
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-lg leading-none font-semibold", className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
