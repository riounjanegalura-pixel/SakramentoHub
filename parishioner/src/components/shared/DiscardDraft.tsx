import { useState } from 'react'
import { Button } from '../ui/button'
import { ConfirmDialog } from './ConfirmDialog'

/**
 * "Discard draft": a quiet control away from the thumb zone, never a button beside Continue.
 * Throwing the answers away asks first, in a dialog that names what is lost.
 */
export function DiscardDraft({ onDiscard, className }: { onDiscard: () => void; className?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button type="button" variant="ghost" size="sm" className={className} onClick={() => setOpen(true)}>
        Discard draft
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Discard this draft?"
        description="Everything you have entered in this booking will be lost. This cannot be undone."
      >
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)}>
            Keep editing
          </Button>
          <Button type="button" variant="destructive" className="flex-1" onClick={onDiscard}>
            Yes, discard
          </Button>
        </div>
      </ConfirmDialog>
    </>
  )
}
