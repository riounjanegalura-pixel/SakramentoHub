import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Check, X } from 'lucide-react'
import { ResultMark } from '../../../components/shared/ResultMark'
import { fetchParishInfo } from '../../../lib/data/parish'

/**
 * Where PayMongo returns someone who paid a walk-in booking from their own phone. They have no
 * account, so this page needs no login and shows nothing about any booking. Arriving here is
 * not proof of payment — only PayMongo's signed webhook confirms it — so the wording stays careful.
 */
export function PaymentReceivedScreen() {
  const [params] = useSearchParams()
  const cancelled = params.get('cancelled') === '1'
  const { data: parish } = useQuery({ queryKey: ['parish'], queryFn: fetchParishInfo })

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col items-center justify-center gap-4 bg-paper p-6 text-center">
      {cancelled ? (
        <>
          <ResultMark tone="stop" icon={X} />
          <h1 className="font-display text-display-xl font-semibold text-navy">Payment not completed</h1>
          <p className="text-body text-ink-muted">
            Your booking is saved but not paid yet. Ask the parish office for a new payment link before the payment window closes.
          </p>
        </>
      ) : (
        <>
          <ResultMark tone="done" icon={Check} />
          <h1 className="font-display text-display-xl font-semibold text-navy">Thank you</h1>
          <p className="text-body text-ink-muted">
            If you completed the payment in GCash, the parish office will see it within a few minutes and confirm your booking using the
            contact details you gave at the counter. You can close this page.
          </p>
        </>
      )}
      {parish && (
        <p className="text-body text-ink-muted">
          Questions? Call {parish.name} at <a href={`tel:${parish.phone}`} className="font-semibold text-navy">{parish.phone}</a>.
        </p>
      )}
    </div>
  )
}
