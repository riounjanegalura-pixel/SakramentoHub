import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '../../components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../../components/ui/dialog'
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle, DrawerTrigger } from '../../components/ui/drawer'
import { useIsDesktop } from '../../hooks/useIsDesktop'
import { fetchRequirements } from '../../lib/data/requirements'
import { fetchWallet } from '../../lib/data/wallet'
import { DocumentList, PrepareList } from './ServiceDetailParts'

interface WhatToBringProps {
  serviceId: string
  serviceName: string
  /** Anything else to have ready (the wizard definition's `prepare`). */
  prepare: string[]
  size?: 'sm' | 'lg'
  className?: string
  /** False at the office desk: staff have no wallet, so it is never read and nothing is ticked. */
  withWallet?: boolean
}

/**
 * "What to bring": the service's documents (ticked when the wallet already holds one) and what else to prepare.
 * A bottom drawer on a phone, a dialog on a desktop; focus returns to the button on close. Used by the service
 * page and the booking wizard so the list is the same in both places.
 */
export function WhatToBring({ serviceId, serviceName, prepare, size = 'lg', className, withWallet = true }: WhatToBringProps) {
  const isDesktop = useIsDesktop()
  const [open, setOpen] = useState(false)
  // Same keys as the service page and the wallet tiles, so an already loaded list shows at once.
  const requirements = useQuery({ queryKey: ['requirements', serviceId], queryFn: () => fetchRequirements(serviceId), enabled: open })
  const wallet = useQuery({ queryKey: ['wallet'], queryFn: fetchWallet, retry: false, enabled: open && withWallet })
  const heldKinds = new Set(withWallet ? (wallet.data ?? []).map((d) => d.kind as string) : [])

  const trigger = (
    <Button type="button" variant="outline" size={size} className={className}>
      What to bring
    </Button>
  )
  const description = `${serviceName}: the documents to prepare and anything else to have ready.`
  const body = (
    <>
      {requirements.isLoading && <p role="status" className="text-sm text-ink-muted">Loading documents…</p>}
      {requirements.isError && (
        <div role="alert">
          <p className="mb-2 text-sm text-danger">Couldn&apos;t load the documents list. Check your connection and try again.</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void requirements.refetch()}>
            Retry
          </Button>
        </div>
      )}
      {requirements.data && <DocumentList documents={requirements.data.documents} heldKinds={heldKinds} />}
      {prepare.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-2 text-sm font-semibold text-ink">Also prepare</h3>
          <PrepareList items={prepare} />
        </div>
      )}
    </>
  )

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>{trigger}</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>What to bring</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          {body}
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>{trigger}</DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>What to bring</DrawerTitle>
          <DrawerDescription>{description}</DrawerDescription>
        </DrawerHeader>
        <div className="max-h-[55vh] overflow-y-auto px-4 pb-2">{body}</div>
        <DrawerFooter>
          <DrawerClose asChild>
            <Button type="button" variant="outline" size="lg">Close</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
