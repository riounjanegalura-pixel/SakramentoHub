import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { QrCode } from 'lucide-react'
import { AppShell } from '../../components/shared/AppShell'
import { AppHeader } from '../../components/shared/AppHeader'
import { Button } from '../../components/ui/button'
import { fetchDonationStatus } from '../../lib/data/donations'
import { peso } from '../../lib/domain'

type StoredQr = { donationId: string; qrImage: string; amountCentavos: number; reference: string }

function readStored(id: string | null): StoredQr | null {
  if (!id) return null
  try {
    const raw = sessionStorage.getItem(`donation-qr:${id}`)
    return raw ? (JSON.parse(raw) as StoredQr) : null
  } catch {
    return null
  }
}

/**
 * QR Ph for a gift. The donor scans the code in GCash, Maya or a bank app. This page only waits: it asks the server
 * every few seconds and moves on once PayMongo's signed webhook has marked the gift paid. Scanning proves nothing.
 * Public: a donor needs no account.
 */
export function DonateQrScreen() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const donationId = params.get('donationId')
  const stored = readStored(donationId)

  const { data } = useQuery({
    queryKey: ['donation-status', donationId],
    queryFn: () => fetchDonationStatus(donationId!),
    enabled: !!donationId && !!stored,
    refetchInterval: 3000,
  })

  const paid = data?.status === 'paid'
  useEffect(() => {
    if (paid) navigate('/donate/thanks', { replace: true })
  }, [paid, navigate])

  const header = <AppHeader title="Scan to give" onBack={() => navigate('/')} />

  if (!stored) {
    return (
      <AppShell showBottomNav={false} webFrame webWidth="max-w-2xl" header={header}>
        <div className="flex flex-col gap-3 p-4">
          <p className="text-body text-ink">We could not find this gift. Please start again.</p>
          <Button type="button" variant="outline" onClick={() => navigate('/')}>Back to Home</Button>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell showBottomNav={false} webFrame webWidth="max-w-2xl" header={header}>
      <div className="flex flex-col items-center gap-5 p-4">
        <section aria-labelledby="gift-amount" className="w-full rounded-2xl border-t-[3px] border-gold bg-paper-deep p-5">
          <h2 id="gift-amount" className="text-note text-ink-muted">Your gift</h2>
          <p className="mt-1 font-sans text-amount tabular-nums text-ink">{peso(stored.amountCentavos)}</p>
        </section>
        <div className="rounded-2xl border border-line bg-white p-4">
          <img
            src={stored.qrImage}
            alt={`QR Ph code to give ${peso(stored.amountCentavos)}`}
            width={295}
            height={295}
            className="h-[295px] w-[295px] max-w-full"
            style={{ imageRendering: 'pixelated' }}
          />
        </div>
        <a href={stored.qrImage} download={`qr-ph-${stored.reference}.png`} className="text-sm font-medium text-navy underline">
          Save the QR image
        </a>
        <ol className="flex w-full list-decimal flex-col gap-1 pl-5 text-body text-ink">
          <li>Open GCash, Maya or your bank app and choose <span className="font-semibold">Scan QR</span>.</li>
          <li>Scan this code. The amount is already filled in.</li>
          <li>Approve the payment. This page updates by itself.</li>
        </ol>
        <p role="status" className="flex items-center gap-2 text-note text-ink-muted">
          <QrCode size={16} aria-hidden="true" /> Waiting for your gift. The code is good for 30 minutes.
        </p>
        <Button type="button" variant="ghost" onClick={() => navigate('/donate/cancelled')}>Cancel</Button>
      </div>
    </AppShell>
  )
}