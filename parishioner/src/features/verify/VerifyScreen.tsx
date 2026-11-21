import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, SearchX } from 'lucide-react'
import { verifyCertificate } from '../../lib/data/verify'
import { ApiError } from '../../lib/api/client'
import type { CertificateVerification } from '../../lib/types'
import { Field, FieldErrorAlertContext } from '../../components/ui/field'
import { Input } from '../../components/ui/input'
import { Skeleton } from '../../components/ui/skeleton'

// This page is deliberately plain: no motion library and no animation or transition classes anywhere in it, so a
// certificate result appears at once and reads the same for everybody (spec section 12). It therefore uses plain
// class strings for its buttons instead of the shared Button, which carries a press animation.
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus'
const PRIMARY_BUTTON = `inline-flex min-h-14 w-full items-center justify-center rounded-xl bg-navy hover:bg-navy-deep px-5 py-3 text-body font-semibold text-white disabled:opacity-50 ${FOCUS}`
const SECONDARY_BUTTON = `inline-flex min-h-11 items-center justify-center rounded-xl border border-line bg-surface px-5 text-sm font-semibold text-navy hover:bg-paper ${FOCUS}`

/** 2026-10-05 -> "October 5, 2026" (read as a plain calendar date, never shifted by time zone). */
function longDate(ymd: string): string {
  return new Date(`${ymd}T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 py-3 sm:flex-row sm:justify-between sm:gap-4">
      <dt className="text-ink-muted">{label}</dt>
      <dd className={`break-words font-semibold text-ink sm:text-right ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  )
}

function Result({ result }: { result: CertificateVerification }) {
  if (result.status === 'revoked') {
    return (
      <div role="status" className="flex flex-col items-center gap-3 text-center">
        <AlertTriangle size={48} className="text-status-pending-fg" aria-hidden="true" />
        <h2 className="font-display text-xl font-semibold text-ink">Certificate withdrawn</h2>
        <p className="text-sm text-ink">This certificate was withdrawn by the parish office.</p>
        <p className="text-sm text-ink-muted">
          Register number <span className="font-mono font-semibold text-ink">{result.registerNumber}</span>. Do not rely on a printed copy of it.
        </p>
      </div>
    )
  }
  return (
    <div role="status" className="flex flex-col gap-3">
      <div className="flex flex-col items-center gap-2 text-center">
        <CheckCircle2 size={48} className="text-status-done-fg" aria-hidden="true" />
        <h2 className="font-display text-xl font-semibold text-ink">Valid certificate</h2>
        <p className="text-sm text-ink-muted">This record is in the parish register.</p>
      </div>
      <dl className="divide-y divide-line text-sm">
        <Detail label="Parish" value={result.parishName} />
        <Detail label="Sacrament" value={result.sacrament} />
        <Detail label="Register number" value={result.registerNumber} mono />
        <Detail label="Name" value={result.subjectName} />
        <Detail label="Ceremony date" value={longDate(result.ceremonyDate)} mono />
        <Detail label="Minister" value={result.minister} />
      </dl>
      {result.correctedOn && (
        <p className="text-center text-sm text-ink-muted">Record corrected on {longDate(result.correctedOn)}</p>
      )}
    </div>
  )
}

function Failure({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const status = error instanceof ApiError ? error.status : null
  if (status === 404) {
    return (
      <div role="status" className="flex flex-col items-center gap-3 text-center">
        <SearchX size={48} className="text-ink-muted" aria-hidden="true" />
        <h2 className="font-display text-xl font-semibold text-ink">No record found</h2>
        <p className="text-sm text-ink-muted">Check the number and code printed on the certificate and try again.</p>
      </div>
    )
  }
  if (status === 429) {
    return (
      <div role="status" className="flex flex-col items-center gap-3 text-center">
        <AlertTriangle size={48} className="text-status-pending-fg" aria-hidden="true" />
        <h2 className="font-display text-xl font-semibold text-ink">Too many attempts</h2>
        <p className="text-sm text-ink-muted">Please wait a minute, then check again.</p>
      </div>
    )
  }
  return (
    <div role="status" className="flex flex-col items-center gap-3 text-center">
      <AlertTriangle size={48} className="text-status-pending-fg" aria-hidden="true" />
      <h2 className="font-display text-xl font-semibold text-ink">We couldn&apos;t check this certificate</h2>
      <p className="text-sm text-ink-muted">Check your connection and try again.</p>
      <button type="button" onClick={onRetry} className={SECONDARY_BUTTON}>
        Try again
      </button>
    </div>
  )
}

/** Placeholder in the result card's shape, shown while the check is in flight. Static: no pulse. */
function Checking() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-3">
      <p className="sr-only">Checking the certificate</p>
      <Skeleton className="mx-auto size-12 rounded-full" />
      <Skeleton className="mx-auto h-6 w-48" />
      <Skeleton className="h-5 w-full" />
      <Skeleton className="h-5 w-full" />
      <Skeleton className="h-5 w-full" />
    </div>
  )
}

/**
 * Public certificate check. Reached from the QR code on a printed certificate (/verify/:number/:code)
 * or by typing the number and code (/verify). No login, no app chrome: the visitor may be an employer
 * or another parish with no account. It reveals only what the server returns for a matching pair.
 */
export function VerifyScreen() {
  const params = useParams<{ number: string; code: string }>()
  const [number, setNumber] = useState(params.number ?? '')
  const [code, setCode] = useState(params.code ?? '')
  const last = useRef<{ number: string; code: string } | null>(null)
  const [missing, setMissing] = useState(false)
  const numberRef = useRef<HTMLInputElement>(null)
  const codeRef = useRef<HTMLInputElement>(null)

  const mutation = useMutation({
    mutationFn: (input: { number: string; code: string }) => verifyCertificate(input.number, input.code),
  })

  const check = (input: { number: string; code: string }) => {
    last.current = input
    mutation.mutate(input)
  }

  const autoStarted = useRef(false)
  useEffect(() => {
    if (autoStarted.current || !params.number || !params.code) return
    autoStarted.current = true
    last.current = { number: params.number, code: params.code }
    mutation.mutate({ number: params.number, code: params.code })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.number, params.code])

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!number.trim() || !code.trim()) {
      setMissing(true)
      // First empty field takes focus; what was typed stays.
      ;(!number.trim() ? numberRef.current : codeRef.current)?.focus()
      return
    }
    setMissing(false)
    check({ number: number.trim(), code: code.trim() })
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col gap-6 bg-paper px-4 py-8 lg:min-h-0 lg:max-w-none lg:bg-transparent lg:px-0">
      <header className="lg:text-center">
        <Link to="/" className={`inline-flex min-h-11 items-center font-display text-heading font-semibold text-navy lg:hidden ${FOCUS}`}>SakramentoHub</Link>
        <h1 className="mt-4 font-display text-display font-semibold text-navy">Check a certificate</h1>
        <p className="mt-2 text-body text-ink-muted">Enter the register number and verification code printed on the certificate.</p>
      </header>

      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4 lg:rounded-2xl lg:border lg:border-line lg:bg-surface lg:p-4">
        {missing && (
          <p role="alert" className="text-sm font-medium text-danger">Enter the register number and the verification code.</p>
        )}
        {/* The summary above announces the problem once; the field messages beside the inputs are not alerts as well. */}
        <FieldErrorAlertContext.Provider value={!missing}>
          <Field id="verify-number" label="Register number" required error={missing && !number.trim() ? 'Enter the register number.' : undefined}>
            <Input ref={numberRef} value={number} onChange={(e) => setNumber(e.target.value)} placeholder="BAP-2026-0001" autoCapitalize="characters" autoComplete="off" spellCheck={false} className="font-mono" />
          </Field>
          <Field id="verify-code" label="Verification code" required error={missing && !code.trim() ? 'Enter the verification code.' : undefined}>
            <Input ref={codeRef} value={code} onChange={(e) => setCode(e.target.value)} placeholder="XXXX-XXXX-XXXX" autoCapitalize="characters" autoComplete="off" spellCheck={false} className="font-mono" />
          </Field>
        </FieldErrorAlertContext.Provider>
        <button type="submit" disabled={mutation.isPending} className={PRIMARY_BUTTON}>
          {mutation.isPending ? 'Checking…' : 'Check certificate'}
        </button>
      </form>

      {(mutation.isPending || mutation.isSuccess || mutation.isError) && (
        <div data-result-card className="rounded-2xl border border-line bg-surface p-6">
          {mutation.isPending && <Checking />}
          {mutation.isSuccess && <Result result={mutation.data} />}
          {mutation.isError && <Failure error={mutation.error} onRetry={() => last.current && check(last.current)} />}
        </div>
      )}

      <p className="mt-auto text-center text-sm text-ink-muted lg:hidden">
        <Link to="/login" className={`inline-flex min-h-11 items-center font-semibold text-navy underline underline-offset-4 ${FOCUS}`}>Log in to SakramentoHub</Link>
      </p>
    </div>
  )
}
