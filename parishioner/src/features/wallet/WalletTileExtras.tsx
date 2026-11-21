import { useContext, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { WizardContext } from '../booking/wizard/WizardContext'
import { fetchRequirements } from '../../lib/data/requirements'
import { fetchWallet } from '../../lib/data/wallet'
import type { WalletDocument } from '../../lib/types'
import { Button } from '../../components/ui/button'
import { WalletPicker } from './WalletPicker'
import { FRESH_COPY_KINDS, olderThanSixMonths } from './walletKinds'

interface Props {
  /** The document key of the tile (the form field). */
  docKey: string
  /** The form field's current value. */
  value: string | undefined
  onChoose: (fileUrl: string) => void
}

/**
 * The wallet's two additions to a Documents-step tile: choose a wallet document of the tile's kind, and
 * warn about an old copy. The tile learns its kind from the service's requirements, by key.
 * Renders nothing in office-desk mode (staff have no wallet), and nothing it cannot be sure of.
 */
export function WalletTileExtras(props: Props) {
  const wizard = useContext(WizardContext)
  if (!wizard || wizard.mode === 'desk') return null
  return <Extras {...props} sacrament={wizard.definition.sacrament} />
}

function Extras({ docKey, value, onChoose, sacrament }: Props & { sacrament: string }) {
  const requirements = useQuery({ queryKey: ['requirements', sacrament], queryFn: () => fetchRequirements(sacrament), retry: false })
  const wallet = useQuery({ queryKey: ['wallet'], queryFn: fetchWallet, retry: false })
  const [picking, setPicking] = useState(false)
  const [chosen, setChosen] = useState<WalletDocument | null>(null)
  const kind = requirements.data?.documents.find((d) => d.key === docKey)?.walletKind
  const matching = kind ? (wallet.data ?? []).filter((d) => d.kind === kind) : []

  const showWarning =
    sacrament === 'wedding' && !!chosen && chosen.fileUrl === value && FRESH_COPY_KINDS.includes(chosen.kind) && olderThanSixMonths(chosen.createdAt)

  return (
    <div className="-mt-1 mb-3">
      {matching.length > 0 && !picking && (
        <Button type="button" variant="link" size="sm" onClick={() => setPicking(true)} className="px-0">
          Choose from wallet
        </Button>
      )}
      {picking && (
        <WalletPicker
          documents={matching}
          onClose={() => setPicking(false)}
          onChoose={(doc) => {
            setChosen(doc)
            setPicking(false)
            onChoose(doc.fileUrl)
          }}
        />
      )}
      {showWarning && (
        <p className="mt-2 rounded-xl bg-status-pending-bg px-3 py-2 text-sm font-medium text-status-pending-fg" role="status">
          Parishes usually ask for a copy issued within the last 6 months.
        </p>
      )}
    </div>
  )
}
