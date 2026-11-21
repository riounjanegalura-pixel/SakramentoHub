import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Loader2, QrCode, RefreshCw } from 'lucide-react'
import { AppShell } from '../../../components/shared/AppShell'
import { AppHeader } from '../../../components/shared/AppHeader'
import { Button } from '../../../components/ui/button'
import { fetchBooking, fetchPaymentQr } from '../../../lib/data/bookings'
import { SACRAMENT_LABEL, peso } from '../../../lib/domain'

/**
 * QR Ph payment (PAYMONGO_METHOD=qrph). PaymentController::initiate sends the browser here; the backend creates one QR
 * for the exact fee (or hands back the open one). The parishioner scans it in GCash, Maya or any bank app and approves
 * there. This page only waits: it re-reads the booking every few seconds and moves on once PayMongo's signed webhook
 * has marked it paid. Scanning is never treated as proof of payment.
 */
export function QrPaymentScreen() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const bookingId = params.get('bookingId')

  const qr = useQuery({
    queryKey: ['payment-qr', bookingId],
    queryFn: () => fetchPaymentQr(bookingId!),
    enabled: !!bookingId,
    staleTime: Infinity,
    retry: false,
  })

  const { data: booking } = useQuery({
    queryKey: ['booking', bookingId],
    queryFn: () => fetchBooking(bookingId!),
    enabled: !!bookingId,
    refetchInterval: 3000,
  })

  const paid = booking?.paymentStatus === 'paid'
  useEffect(() => {
    if (paid) navigate(`/payment/success?bookingId=${encodeURIComponent(bookingId!)}`, { replace: true })
  }, [paid, bookingId, navigate])

  const header = <AppHeader title="Scan to pay" onBack={() => navigate(-1)} />

  if (!bookingId) {
    return (
      <AppShell showBottomNav={false} webFrame webWidth="max-w-2xl" header={header}>
        <div className="flex flex-col gap-3 p-4">
          <p className="text-body text-ink">We could not tell which booking to pay.</p>
          <Button type="button" variant="outline" onClick={() => navigate('/booking/history')}>Go to My bookings</Button>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell showBottomNav={false} webFrame webWidth="max-w-2xl" header={header}>
      <div className="flex flex-col items-center gap-5 p-4">
        {booking && (
          <section aria-labelledby="qr-amount" className="w-full rounded-2xl border-t-[3px] border-gold bg-paper-deep p-5">
            <h2 id="qr-amount" className="text-note text-ink-muted">{SACRAMENT_LABEL[booking.sacrament]} fee</h2>
            <p className="mt-1 font-sans text-amount tabular-nums text-ink">{peso(booking.amountDueCentavos ?? 0)}</p>
          </section>
        )}

        {qr.isPending && (
          <p role="status" className="flex items-center gap-2 py-16 text-body text-ink-muted">
            <Loader2 className="animate-spin" size={20} aria-hidden="true" /> Creating your QR code…
          </p>
        )}

        {qr.isError && (
          <div role="alert" className="flex w-full flex-col gap-3 rounded-xl bg-status-pending-bg p-4 text-body text-status-pending-fg">
            <p>{(qr.error as Error).message}</p>
            <Button type="button" variant="outline" onClick={() => void qr.refetch()}>
              <RefreshCw size={16} aria-hidden="true" /> Try again
            </Button>
          </div>
        )}

        {qr.data && (
          <>
            <div className="rounded-2xl border border-line bg-white p-4">
              {/* PayMongo's code is 590 px wide. Shown at exactly half (295 px) its edges stay sharp, so a camera can read it;
                  an uneven shrink (the old 256 px) blurs them. */}
              <img
                src={qr.data.qrImage}
                alt={`QR Ph code to pay ${peso(qr.data.amountCentavos)}`}
                width={295}
                height={295}
                className="h-[295px] w-[295px] max-w-full"
                style={{ imageRendering: 'pixelated' }}
              />
            </div>
            <a href={qr.data.qrImage} download={`qr-ph-${qr.data.reference}.png`} className="text-sm font-medium text-navy underline">
              Save the QR image
            </a>
            <ol className="flex w-full list-decimal flex-col gap-1 pl-5 text-body text-ink">
              <li>Open GCash, Maya or your bank app and choose <span className="font-semibold">Scan QR</span>.</li>
              <li>Scan this code. The amount is already filled in.</li>
              <li>Approve the payment. This page updates by itself.</li>
            </ol>
            <p className="w-full text-note text-ink-muted">
              Turn your screen brightness up and hold the camera about 20 cm away. Paying from this same phone? Save the image, then in GCash choose Scan QR and upload it from your gallery.
            </p>
            <p role="status" className="flex items-center gap-2 text-note text-ink-muted">
              <QrCode size={16} aria-hidden="true" /> Waiting for your payment. The code is good for 30 minutes.
            </p>
            <Button type="button" variant="ghost" onClick={() => navigate(`/payment/cancelled?bookingId=${encodeURIComponent(bookingId)}`)}>
              Cancel
            </Button>
          </>
        )}
      </div>
    </AppShell>
  )
}
