import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { createDonation } from '../../lib/data/donations'
import { peso } from '../../lib/domain'
import { cn } from '../../lib/utils'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { ConfirmDialog } from './ConfirmDialog'

type DonateDialogProps = {
  open: boolean
  onClose: () => void
}

/** The gift sizes offered as one tap; "Other" lets the donor type any amount in range. */
const PRESETS = [100, 200, 500, 1000] as const
const MIN_PESOS = 20
const MAX_PESOS = 100_000

/** Pesos typed or tapped, as whole centavos, or an error sentence the donor can act on. */
function parseAmount(preset: number | null, typed: string): { centavos: number } | { error: string } {
  if (preset !== null) return { centavos: preset * 100 }
  const text = typed.replace(/[₱,\s]/g, '')
  if (text === '') return { error: 'Enter how much you would like to give.' }
  // Digits with at most two decimals: "1e3", "0x10" and "5.555" are not amounts.
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return { error: 'Enter how much you would like to give, like 250 or 250.50.' }
  const pesos = Number(text)
  if (pesos < MIN_PESOS) return { error: `The smallest gift is ₱${MIN_PESOS}.` }
  if (pesos > MAX_PESOS) return { error: `For a gift above ₱${MAX_PESOS.toLocaleString('en-PH')}, please see the parish office.` }
  return { centavos: Math.round(pesos * 100) }
}

/**
 * Support our parish, in two short steps (the flow of a bill-payment app): choose an amount, check the summary, then
 * go to PayMongo's GCash checkout. Nothing is recorded as given until PayMongo confirms it to the server; the page the
 * donor returns to only says thank you.
 */
export function DonateDialog({ open, onClose }: DonateDialogProps) {
  const [step, setStep] = useState<'amount' | 'summary'>('amount')
  const [preset, setPreset] = useState<number | null>(null)
  const [typed, setTyped] = useState('')
  const [error, setError] = useState<string | null>(null)

  const parsed = parseAmount(preset, typed)
  const mutation = useMutation({
    mutationFn: (centavos: number) => createDonation(centavos),
    onSuccess: (res) => {
      // QR Ph: keep the code for the scan page (a full page load clears memory), then open it.
      if (res.qrImage && res.donationId) {
        try {
          sessionStorage.setItem(`donation-qr:${res.donationId}`, JSON.stringify(res))
        } catch {
          // Private mode: the scan page then asks the donor to try again.
        }
        window.location.assign(`/donate/qr?donationId=${encodeURIComponent(res.donationId)}`)
        return
      }
      if (res.checkoutUrl) window.location.assign(res.checkoutUrl)
    },
  })

  function close() {
    setStep('amount')
    setPreset(null)
    setTyped('')
    setError(null)
    mutation.reset()
    onClose()
  }

  function toSummary() {
    if ('error' in parsed) {
      setError(parsed.error)
      return
    }
    setError(null)
    setStep('summary')
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) close()
      }}
      title="Support our parish"
      description={step === 'amount' ? 'Set an amount to give.' : "You're about to give"}
    >
      {step === 'amount' ? (
        <>
          <div role="group" aria-label="Amount" className="grid grid-cols-2 gap-3">
            {PRESETS.map((p) => (
              <Button
                key={p}
                type="button"
                variant={preset === p ? 'default' : 'outline'}
                aria-pressed={preset === p}
                onClick={() => {
                  setPreset(p)
                  setTyped('')
                  setError(null)
                }}
              >
                <span className="tabular-nums">₱{p.toLocaleString('en-PH')}</span>
              </Button>
            ))}
          </div>
          <div>
            <label htmlFor="donation-amount" className="mb-1 block text-body font-semibold text-ink">
              Other amount
            </label>
            <p id="donation-hint" className="mb-1 text-sm text-ink-muted">From ₱{MIN_PESOS} to ₱{MAX_PESOS.toLocaleString('en-PH')}</p>
            <div className="relative">
              <span aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-body text-ink-muted">₱</span>
              <Input
                id="donation-amount"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0.00"
                value={typed}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? 'donation-hint donation-error' : 'donation-hint'}
                className={cn('pl-8 tabular-nums')}
                onChange={(e) => {
                  setTyped(e.target.value)
                  setPreset(null)
                  setError(null)
                }}
              />
            </div>
            {error && (
              <p id="donation-error" role="alert" className="mt-1 text-sm font-medium text-danger">
                {error}
              </p>
            )}
          </div>
          <Button type="button" size="lg" onClick={toSummary}>
            Continue
          </Button>
          <Button type="button" variant="outline" onClick={close}>
            Cancel
          </Button>
        </>
      ) : (
        <>
          <p className="tabular-nums font-display text-display font-semibold text-navy">
            {'centavos' in parsed ? peso(parsed.centavos) : ''}
          </p>
          <p className="text-body text-ink">
            You will pay with GCash through PayMongo. Any fee GCash charges goes to GCash, not to the parish.
          </p>
          {mutation.isError && (
            <p role="alert" className="text-sm font-medium text-danger">
              {(mutation.error as Error).message}
            </p>
          )}
          <Button
            type="button"
            size="lg"
            disabled={mutation.isPending || !('centavos' in parsed)}
            onClick={() => 'centavos' in parsed && mutation.mutate(parsed.centavos)}
          >
            {mutation.isPending ? 'Opening GCash…' : `Give ${'centavos' in parsed ? peso(parsed.centavos) : ''} with GCash`}
          </Button>
          <Button type="button" variant="outline" disabled={mutation.isPending} loading={mutation.isPending} onClick={() => setStep('amount')}>
            Change amount
          </Button>
        </>
      )}
    </ConfirmDialog>
  )
}
