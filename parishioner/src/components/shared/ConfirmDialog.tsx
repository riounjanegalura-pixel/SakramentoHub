import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { useIsDesktop } from '../../hooks/useIsDesktop'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '../ui/drawer'

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: ReactNode
  /** The body under the description: fields and the buttons (the caller owns them, so a form can wrap both). */
  children?: ReactNode
}

/**
 * A confirmation, per spec section 14: a bottom drawer on a phone, a centred dialog on a desktop. Both are modal,
 * trap focus, close on Escape and hand focus back to whatever opened them.
 */
export function ConfirmDialog({ open, onOpenChange, title, description, children }: ConfirmDialogProps) {
  const isDesktop = useIsDesktop()

  // Radix only returns focus to its own Trigger; ours is opened from state, so remember the opener ourselves.
  // A layout effect runs before the dialog moves focus into itself.
  const opener = useRef<HTMLElement | null>(null)
  useLayoutEffect(() => {
    if (open) opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
  }, [open])
  const returnFocus = (event: Event) => {
    if (!opener.current?.isConnected) return
    event.preventDefault()
    opener.current.focus()
  }

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent onCloseAutoFocus={returnFocus}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          {children}
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent onCloseAutoFocus={returnFocus}>
        <DrawerHeader>
          <DrawerTitle>{title}</DrawerTitle>
          <DrawerDescription>{description}</DrawerDescription>
        </DrawerHeader>
        <div className="grid gap-4 overflow-y-auto px-4 pb-6">{children}</div>
      </DrawerContent>
    </Drawer>
  )
}
