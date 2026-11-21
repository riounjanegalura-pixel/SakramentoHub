import * as m from 'motion/react-m'
import { durations, ease } from '../../lib/motion'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { AdminLayout } from '../../components/shared/AdminLayout'
import { Disclosure } from '../../components/shared/Disclosure'
import { Reveal } from '../../components/shared/Reveal'
import { Skeleton } from '../../components/shared/Skeleton'
import { LoadError } from '../../components/shared/LoadError'
import { BTN_OUTLINE, BTN_PRIMARY, REG_INPUT } from '../register/registerForm'
import { fetchBooking } from '../../lib/api/bookings'
import { uploadDocument } from '../../lib/api/documents'
import {
  createWalkIn, fetchFreeStarts, fetchWalkInSchema, lookupParishioner, submitWalkIn, updateWalkIn,
  type WalkInField, type WalkInInput,
} from '../../lib/api/walkIns'
import { ApiError } from '../../lib/api/client'
import { SACRAMENT_LABEL } from '../../lib/constants'
import { formatTime, parishToday } from '../../lib/domain'
import type { Sacrament } from '../../lib/types'

/*
 * The office's walk-in booking: one page, the server's own field list. Every rule comes from the server (the same
 * rules, scheduling and payment as an online booking). The "This booking" box lists what still blocks Submit.
 */

const INPUT = REG_INPUT
const CARD = 'flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5 md:p-6'
const LEGEND = 'px-1 font-display text-[22px] font-semibold text-navy'
const LABEL = 'flex flex-col gap-1 text-[14px] font-medium text-ink'
const ERR = 'text-[13px] font-normal text-danger'
const RELATIONSHIPS = ['self', 'child', 'parent', 'spouse', 'sibling', 'relative', 'other']
type Values = Record<string, unknown>

/** "" and unset answers are not sent; the server treats a missing optional key as empty. */
function prune(values: Values): Values {
  const out: Values = {}
  for (const [k, v] of Object.entries(values)) {
    if (v === '' || v === undefined || v === null) continue
    out[k] = Array.isArray(v) ? v.map((row) => prune(row as Values)) : v
  }
  return out
}

function FieldInput({ field, value, onChange, error }: { field: WalkInField; value: unknown; onChange: (v: unknown) => void; error?: string }) {
  const id = `f-${field.key}`
  const common = { id, 'aria-invalid': error ? true : undefined }
  let control
  if (field.type === 'select') {
    control = (
      <select {...common} className={INPUT} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)}>
        <option value="">Select…</option>
        {field.options?.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    )
  } else if (field.type === 'yesno') {
    control = (
      <select {...common} className={INPUT} value={value === true ? 'yes' : value === false ? 'no' : ''} onChange={(e) => onChange(e.target.value === '' ? '' : e.target.value === 'yes')}>
        <option value="">Select…</option>
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </select>
    )
  } else {
    control = (
      <input
        {...common}
        className={INPUT}
        type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'}
        value={String(value ?? '')}
        onChange={(e) => onChange(field.type === 'number' && e.target.value !== '' ? Number(e.target.value) : e.target.value)}
      />
    )
  }
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[14px] font-medium text-ink">
        {field.label}
        {field.required && <span className="font-normal text-ink-muted"> (Required)</span>}
      </label>
      {control}
      {error && <p role="alert" className={ERR}>{error}</p>}
    </div>
  )
}

export function WalkInScreen() {
  const { id: editingId } = useParams()
  const navigate = useNavigate()

  const [sacrament, setSacrament] = useState<Sacrament | ''>('')
  const [contact, setContact] = useState({ fullName: '', phone: '', email: '', relationship: '' })
  const [linked, setLinked] = useState<{ id: string; fullName: string } | null>(null)
  const [lookupMsg, setLookupMsg] = useState('')
  const [values, setValues] = useState<Values>({})
  const [date, setDate] = useState('')
  const [start, setStart] = useState('')
  const [waive, setWaive] = useState(false)
  const [waiveReason, setWaiveReason] = useState('')
  const [draftId, setDraftId] = useState<string | null>(editingId ?? null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [topError, setTopError] = useState('')

  // Editing a returned walk-in: start from what was entered.
  const existing = useQuery({ queryKey: ['walk-in-edit', editingId], queryFn: () => fetchBooking(editingId!), enabled: !!editingId })
  useEffect(() => {
    const b = existing.data
    if (!b) return
    setSacrament(b.sacrament)
    setValues(b.formData)
    setContact({
      fullName: b.walkInContact?.fullName ?? '',
      phone: b.walkInContact?.phone ?? '',
      email: b.walkInContact?.email ?? '',
      relationship: b.formData.bookingFor === 'self' ? 'self' : String(b.formData.relationship ?? b.walkInContact?.relationship ?? ''),
    })
    setDate(b.appointmentDate ?? '')
    setStart(b.appointmentStart?.slice(0, 5) ?? '')
  }, [existing.data])

  const schema = useQuery({ queryKey: ['walk-in-fields', sacrament], queryFn: () => fetchWalkInSchema(sacrament as Sacrament), enabled: !!sacrament })

  const emergency = sacrament === 'anointing' && values.inDangerOfDeath === true
  const context = { massType: String(values.massType ?? ''), scheduleType: String(values.scheduleType ?? ''), waiveLeadTime: waive }
  const starts = useQuery({
    queryKey: ['walk-in-starts', sacrament, date, context],
    queryFn: () => fetchFreeStarts(sacrament as Sacrament, date, context),
    enabled: !!sacrament && !!date && !emergency,
  })

  const set = (key: string, v: unknown) => setValues((prev) => ({ ...prev, [key]: v }))

  const build = (): WalkInInput => {
    const self = contact.relationship === 'self'
    return {
      contact: { fullName: contact.fullName.trim(), phone: contact.phone.trim(), email: contact.email.trim() || null, relationship: self ? null : contact.relationship || null },
      linkUserId: linked?.id ?? null,
      // The person at the counter is the contact, so their number is the one the priest can call right now.
      formData: prune({ ...values, bookingFor: self ? 'self' : 'other', relationship: self ? null : contact.relationship, alternatePhone: contact.phone.trim() }),
      appointmentDate: emergency ? null : date || null,
      appointmentStart: emergency ? null : start || null,
    }
  }

  const submit = useMutation({
    mutationFn: async () => {
      const input = build()
      const saved = draftId ? await updateWalkIn(draftId, input) : await createWalkIn(sacrament as Sacrament, input)
      setDraftId(saved.id)
      return submitWalkIn(saved.id, { waiveLeadTime: waive, waiveReason })
    },
    onSuccess: (booking) => navigate(`/bookings/${booking.id}`),
    onError: (error) => {
      const fieldErrors = error instanceof ApiError ? error.fieldErrors : {}
      setErrors(Object.fromEntries(Object.entries(fieldErrors).map(([k, v]) => [k.replace(/^formData\./, ''), v])))
      setTopError(error instanceof Error ? error.message : 'Could not save the walk-in.')
    },
  })

  const lookup = useMutation({
    mutationFn: () => lookupParishioner(contact.email.trim()),
    onSuccess: (u) => { setLinked(u); setLookupMsg('') },
    onError: (e) => { setLinked(null); setLookupMsg(e instanceof Error ? e.message : 'Not found.') },
  })

  const upload = async (key: string, file: File | undefined) => {
    if (!file) return
    try {
      const { url } = await uploadDocument(file)
      set(key, url)
      setErrors((e) => ({ ...e, [key]: '' }))
    } catch (e) {
      setErrors((prev) => ({ ...prev, [key]: e instanceof Error ? e.message : 'Upload failed.' }))
    }
  }

  const relationships = useMemo(() => (sacrament === 'funeral' ? RELATIONSHIPS.filter((r) => r !== 'self') : RELATIONSHIPS), [sacrament])
  const err = (k: string) => errors[k] || undefined
  const sponsors = Array.isArray(values.sponsors) ? (values.sponsors as Values[]) : []

  // What still blocks Submit, in the order the page asks for it.
  const fields = schema.data?.fields ?? []
  const docs = schema.data?.documents ?? []
  const blank = (v: unknown) => v === undefined || v === null || v === ''
  const checks: Array<{ label: string; done: boolean }> = []
  const need = (label: string, done: boolean) => checks.push({ label, done })
  need('Full name of the person at the counter', !!contact.fullName.trim())
  need('Mobile number', !!contact.phone.trim())
  need('How they relate to the sacrament', !!contact.relationship)
  need('Sacrament', !!sacrament)
  if (sacrament && !schema.data) need(schema.isError ? 'The form for this sacrament did not load' : 'The form is still loading', false)
  if (sacrament && !emergency) {
    need('Date', !!date)
    need('Time', !!date && !!start)
  }
  if (waive) need('Reason for waiving the lead time', !!waiveReason.trim())
  for (const f of fields) if (f.required) need(f.label, !blank(values[f.key]))
  for (const d of docs) if (d.requirement === 'required') need(d.label, !blank(values[d.key]))
  if (schema.data?.sponsors) need(`Sponsors (at least ${schema.data.sponsors.min})`, sponsors.length >= schema.data.sponsors.min)
  const blockers = checks.filter((c) => !c.done).map((c) => c.label)
  const doneCount = checks.length - blockers.length
  const NEXT_UP = 4
  const ready = blockers.length === 0
  const typeLabel = sacrament ? SACRAMENT_LABEL[sacrament] : 'Not chosen yet'
  const when = emergency ? 'Priest called straight away' : date ? `${date}${start ? `, ${formatTime(start)}` : ''}` : 'Not chosen yet'

  if (editingId && existing.isError) {
    return (
      <AdminLayout title="Edit walk-in booking">
        <LoadError title="The booking didn’t load" message="Check your connection, then try again." detail={(existing.error as Error).message} onRetry={() => void existing.refetch()} />
      </AdminLayout>
    )
  }

  const summary = (
    <aside aria-labelledby="this-booking" className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5 lg:sticky lg:top-6">
      <h2 id="this-booking" className="font-display text-[22px] font-semibold text-navy">This booking</h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[14px]">
        <dt className="text-ink-muted">Sacrament</dt><dd className="text-ink">{typeLabel}</dd>
        <dt className="text-ink-muted">When</dt><dd className="text-ink">{when}</dd>
        <dt className="text-ink-muted">Contact</dt><dd className="text-ink">{contact.fullName.trim() || 'Not entered yet'}</dd>
      </dl>
      {ready ? (
        <p role="status" className="rounded-xl bg-status-done-bg px-3 py-2 text-[14px] font-medium text-status-done-fg">Nothing is missing. You can submit.</p>
      ) : (
        <div role="status" className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between text-[14px]">
            <p className="font-semibold text-ink">{doneCount} of {checks.length} required done</p>
            <p className="text-ink-muted">{blockers.length} to go</p>
          </div>
          <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-paper-deep">
            <m.div className="h-full rounded-full bg-navy" initial={false} animate={{ width: `${checks.length ? Math.round((doneCount / checks.length) * 100) : 0}%` }} transition={{ duration: durations.base, ease: [...ease] }} />
          </div>
          <p className="mt-1 text-[13px] font-medium text-ink-muted">Next up</p>
          <ul className="list-disc pl-5 text-[14px] text-ink">
            {blockers.slice(0, NEXT_UP).map((b) => <li key={b}>{b}</li>)}
          </ul>
          {blockers.length > NEXT_UP && (
            <details className="text-[14px]">
              <summary className="min-h-9 cursor-pointer py-1.5 font-medium text-navy underline underline-offset-4">Show the other {blockers.length - NEXT_UP}</summary>
              <ul className="max-h-60 list-disc overflow-y-auto pl-5 pt-1 text-ink-muted">
                {blockers.slice(NEXT_UP).map((b) => <li key={b}>{b}</li>)}
              </ul>
            </details>
          )}
        </div>
      )}
      <div className="flex flex-col gap-2">
        <button type="submit" disabled={!ready || submit.isPending} className={`${BTN_PRIMARY} w-full`}>{submit.isPending ? 'Submitting…' : 'Submit booking'}</button>
        <button type="button" className={`${BTN_OUTLINE} w-full`} onClick={() => navigate('/bookings')}>Cancel</button>
      </div>
      <p className="text-[13px] text-ink-muted">After submitting, the booking opens so you can take payment (cash, or a GCash link).</p>
    </aside>
  )

  return (
    <AdminLayout title={editingId ? 'Edit walk-in booking' : 'New walk-in booking'}>
      <form
        aria-busy={existing.isLoading || undefined}
        className="grid w-full max-w-[1760px] gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start"
        onSubmit={(e) => {
          e.preventDefault()
          if (!ready) return
          setErrors({})
          setTopError('')
          submit.mutate()
        }}
      >
        <div className="flex flex-col gap-6">
          {editingId && existing.isLoading && <p role="status" className="text-[14px] text-ink-muted">Loading the booking…</p>}
          {topError && <p role="alert" className="rounded-xl border border-danger bg-surface p-3 text-[14px] text-danger">{topError} Fix what is marked below and submit again.</p>}

          <Reveal><fieldset className={`${CARD} md:grid md:grid-cols-2 md:items-start`}>
            <legend className={LEGEND}>1. Who is at the counter</legend>
            <label className={LABEL}>Full name
              <input className={INPUT} value={contact.fullName} onChange={(e) => setContact({ ...contact, fullName: e.target.value })} aria-invalid={!!err('contact.fullName')} />
              {err('contact.fullName') && <span role="alert" className={ERR}>{err('contact.fullName')}</span>}
            </label>
            <label className={LABEL}>Mobile number (09XXXXXXXXX)
              <input className={INPUT} inputMode="tel" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} aria-invalid={!!err('contact.phone')} />
              {err('contact.phone') && <span role="alert" className={ERR}>{err('contact.phone')}</span>}
            </label>
            <label className={LABEL}>Email (optional)
              <input className={INPUT} type="email" value={contact.email} onChange={(e) => { setContact({ ...contact, email: e.target.value }); setLinked(null) }} />
            </label>
            <div className="flex flex-wrap items-center gap-3 text-[14px] md:self-end">
              <button type="button" className={BTN_OUTLINE} disabled={!contact.email.trim() || lookup.isPending} onClick={() => lookup.mutate()}>Find parishioner account</button>
              {linked && <span>Linked to <strong>{linked.fullName}</strong> <button type="button" className="min-h-11 px-2 text-navy underline" onClick={() => setLinked(null)}>Unlink</button></span>}
              {lookupMsg && <span role="status" className="text-ink-muted">{lookupMsg}</span>}
            </div>
            <label className={`${LABEL} md:col-span-2`}>They are the sacrament&apos;s…
              <select className={INPUT} value={contact.relationship} onChange={(e) => setContact({ ...contact, relationship: e.target.value })}>
                <option value="">Select…</option>
                {relationships.map((r) => <option key={r} value={r}>{r === 'self' ? 'Receiving it themselves' : `${r[0].toUpperCase()}${r.slice(1)} of the one receiving it`}</option>)}
              </select>
              {(err('relationship') || err('bookingFor')) && <span role="alert" className={ERR}>{err('relationship') || err('bookingFor')}</span>}
            </label>
          </fieldset></Reveal>

          <Reveal><fieldset className={CARD}>
            <legend className={LEGEND}>2. Sacrament and time</legend>
            <label className={LABEL}>Sacrament
              <select className={INPUT} value={sacrament} disabled={!!editingId} onChange={(e) => { setSacrament(e.target.value as Sacrament); setValues({}); setStart('') }}>
                <option value="">Select…</option>
                {(Object.keys(SACRAMENT_LABEL) as Sacrament[]).map((s) => <option key={s} value={s}>{SACRAMENT_LABEL[s]}</option>)}
              </select>
            </label>
            {emergency ? (
              <p className="text-[14px] text-ink-muted">The patient is in danger of death, so no date is needed: the priest is called straight away.</p>
            ) : (
              sacrament && (
                <>
                  <label className={LABEL}>Date
                    <input className={INPUT} type="date" min={waive ? undefined : parishToday()} value={date} onChange={(e) => { setDate(e.target.value); setStart('') }} />
                  </label>
                  {date && (
                    <label className={LABEL}>Time
                      <select className={INPUT} value={start} onChange={(e) => setStart(e.target.value)}>
                        <option value="">{starts.isLoading ? 'Checking…' : starts.data?.length ? 'Select…' : 'No time is free that day'}</option>
                        {starts.data?.map((t) => <option key={t} value={t}>{formatTime(t)}</option>)}
                      </select>
                    </label>
                  )}
                  {starts.isError && <p role="alert" className={ERR}>Couldn&apos;t check the free times. Pick the date again to retry.</p>}
                  {(err('appointmentDate') || err('appointmentStart')) && <p role="alert" className={ERR}>{err('appointmentDate') || err('appointmentStart')}</p>}
                  <label className="flex min-h-11 items-center gap-2 text-[14px] text-ink">
                    <input type="checkbox" className="size-5" checked={waive} onChange={(e) => setWaive(e.target.checked)} /> Waive the minimum lead time (the priest agreed)
                  </label>
                  {waive && (
                    <label className={LABEL}>Reason
                      <input className={INPUT} value={waiveReason} onChange={(e) => setWaiveReason(e.target.value)} aria-invalid={!!err('waiveReason')} />
                      {err('waiveReason') && <span role="alert" className={ERR}>{err('waiveReason')}</span>}
                    </label>
                  )}
                </>
              )
            )}
          </fieldset></Reveal>

          {sacrament && schema.isLoading && (
            <div aria-busy="true" className="flex flex-col gap-3">
              <p role="status" className="text-[14px] text-ink-muted">Loading the form…</p>
              <div className={CARD}>
                <Skeleton className="h-6 w-32" />
                <div className="grid gap-4 sm:grid-cols-2">
                  {[0, 1, 2, 3].map((i) => <div key={i} className="flex flex-col gap-2"><Skeleton className="h-4 w-24" /><Skeleton className="h-12 w-full rounded-xl" /></div>)}
                </div>
              </div>
            </div>
          )}
          {schema.isError && <LoadError message="Couldn’t load the form for this sacrament. Try again in a minute: the server may still be starting or updating. If it keeps failing, tell whoever looks after the system." onRetry={() => void schema.refetch()} />}
          {!sacrament && <p className="rounded-2xl border border-line bg-surface px-6 py-8 text-center text-[15px] text-ink-muted">Choose a sacrament and the details to collect appear here.</p>}

          {schema.data && (
            <Reveal><fieldset className={CARD}>
              <legend className={LEGEND}>3. Details</legend>
              <p className="text-[13px] text-ink-muted">Everything marked required must be filled in. Addresses are typed in full on one line.</p>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {schema.data.fields.map((f) => (
                  <FieldInput key={f.key} field={f} value={values[f.key]} onChange={(v) => set(f.key, v)} error={err(f.key)} />
                ))}
              </div>

              {schema.data.sponsors && (
                <div className="flex flex-col gap-3">
                  <h3 className="text-[16px] font-semibold text-ink">Sponsors ({schema.data.sponsors.min} to {schema.data.sponsors.max})</h3>
                  {err('sponsors') && <p role="alert" className={ERR}>{err('sponsors')}</p>}
                  {sponsors.map((row, i) => (
                    <Disclosure key={i} defaultOpen title={`Sponsor ${i + 1}`} summary={String(row.fullName ?? row.name ?? '') || 'Not filled in yet'}>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        {schema.data.sponsors!.fields.map((f) => (
                          <FieldInput
                            key={f.key}
                            field={f}
                            value={row[f.key]}
                            onChange={(v) => set('sponsors', sponsors.map((r, j) => (j === i ? { ...r, [f.key]: v } : r)))}
                            error={err(`sponsors.${i}.${f.key}`)}
                          />
                        ))}
                      </div>
                      <button type="button" className={`${BTN_OUTLINE} self-start`} onClick={() => set('sponsors', sponsors.filter((_, j) => j !== i))}>Remove this sponsor</button>
                    </Disclosure>
                  ))}
                  {sponsors.length < schema.data.sponsors.max && (
                    <button type="button" className={`${BTN_OUTLINE} self-start`} onClick={() => set('sponsors', [...sponsors, { religion: 'Roman Catholic' }])}>Add a sponsor</button>
                  )}
                </div>
              )}

              {schema.data.documents.length > 0 && (
                <div className="flex flex-col gap-3">
                  <h3 className="text-[16px] font-semibold text-ink">Documents (scan or photo of the paper copy)</h3>
                  {schema.data.documents.map((d) => (
                    <div key={d.key} className="flex flex-col gap-1.5">
                      <label htmlFor={`doc-${d.key}`} className="text-[14px] font-medium text-ink">
                        {d.label} <span className="font-normal text-ink-muted">({d.requirement === 'required' ? 'Required' : d.condition ?? 'Optional'})</span>
                      </label>
                      <input id={`doc-${d.key}`} type="file" accept=".jpg,.jpeg,.png,.pdf" className="min-h-11 text-[14px]" onChange={(e) => void upload(d.key, e.target.files?.[0])} />
                      {typeof values[d.key] === 'string' && values[d.key] !== '' && <span className="text-[13px] text-status-done-fg">Uploaded.</span>}
                      {err(d.key) && <p role="alert" className={ERR}>{err(d.key)}</p>}
                    </div>
                  ))}
                </div>
              )}
            </fieldset></Reveal>
          )}
        </div>
        {summary}
      </form>
    </AdminLayout>
  )
}
