import { Button } from '../../components/ui/button'
import type { WalletDocument } from '../../lib/types'
import { formatAdded } from './walletKinds'

/** Lists wallet documents (already filtered to the tile's kind) so one can fill a booking's document field. */
export function WalletPicker({ documents, onChoose, onClose }: { documents: WalletDocument[]; onChoose: (doc: WalletDocument) => void; onClose: () => void }) {
  return (
    <div className="mt-2 rounded-2xl border border-line bg-surface p-3">
      <p className="mb-2 text-sm font-semibold text-ink">Choose a document from your wallet</p>
      <ul className="flex flex-col gap-2">
        {documents.map((doc) => (
          <li key={doc.id}>
            <button
              type="button"
              onClick={() => onChoose(doc)}
              className="flex min-h-11 w-full min-w-0 flex-col items-start rounded-xl border border-line px-3 py-2 text-left hover:bg-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              <span className="max-w-full break-words text-sm font-medium text-ink">{doc.personName}</span>
              <span className="text-label text-ink-muted">Added {formatAdded(doc.createdAt)}</span>
            </button>
          </li>
        ))}
      </ul>
      <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={onClose}>
        Cancel
      </Button>
    </div>
  )
}
