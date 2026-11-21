import { useEffect, useId, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, X } from 'lucide-react'
import * as m from 'motion/react-m'
import { AnimatePresence } from 'motion/react'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { updateServiceSettings } from '../../lib/data/settings'
import { durations, ease } from '../../lib/motion'
import type { AdminService, FeeRule } from '../../lib/types'
import { SaveBar } from './SaveBar'
import { toForm, toPayload, type ServiceForm } from './serviceForm'

// ISO weekdays, as the server stores them.
const WEEKDAYS = [
  { n: 1, label: 'Mon', initial: 'M' }, { n: 2, label: 'Tue', initial: 'T' }, { n: 3, label: 'Wed', initial: 'W' }, { n: 4, label: 'Thu', initial: 'T' },
  { n: 5, label: 'Fri', initial: 'F' }, { n: 6, label: 'Sat', initial: 'S' }, { n: 7, label: 'Sun', initial: 'S' },
]

const FEE_LABEL: Record<FeeRule, string> = { none: 'Donation', flat: 'Flat fee', per_sponsor: 'Per sponsor' }
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus'

const peso = (c: number) => `₱${(c / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
const timeLabel = (t: string) => {
  const [h, mm] = t.split(':').map(Number)
  return `${(h % 12) || 12}:${String(mm || 0).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

/** One line that says what the service is set to, so a closed card still tells you the rules. */
function summaryOf(s: AdminService) {
  const parts = [s.feeRule === 'none' ? 'Donation' : `${peso(s.priceCentavos ?? 0)} ${s.feeRule === 'per_sponsor' ? 'per sponsor' : 'flat'}`, `${s.durationMinutes} min`]
  parts.push(s.leadTimeDays > 0 ? `book ${s.leadTimeDays} ${s.leadTimeDays === 1 ? 'day' : 'days'} ahead` : 'any time')
  if (s.dailyCapacity) parts.push(`${s.dailyCapacity} a day`)
  return parts.join(' · ')
}

/** Day chips. Real checkboxes dressed as chips, so keyboard and screen readers work as they should. */
function WeekdayPicker({ legend, value, disabled, onChange }: { legend: string; value: number[]; disabled: boolean; onChange: (next: number[]) => void }) {
  return (
    <fieldset role="group" aria-label={legend} className="flex flex-col gap-1">
      <legend className="mb-1 text-sm font-medium text-ink">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {WEEKDAYS.map(({ n, label }) => {
          const on = value.includes(n)
          return (
            <label
              key={n}
              className={`relative inline-flex min-h-11 min-w-14 items-center justify-center rounded-xl px-3 text-[14px] text-navy has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus ${disabled ? 'opacity-70' : 'cursor-pointer'} ${on ? 'border-2 border-navy bg-status-confirmed-bg px-[11px] font-semibold' : 'border border-input-border bg-surface font-medium'}`}
            >
              <input
                type="checkbox"
                disabled={disabled}
                checked={on}
                onChange={(e) => onChange((e.target.checked ? [...value, n] : value.filter((d) => d !== n)).sort((a, b) => a - b))}
                className="absolute inset-0 size-full cursor-pointer opacity-0"
              />
              {label}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

/** Start times as removable chips plus one small box to add another (24-hour value, shown as AM/PM). */
function SessionTimes({ id, value, disabled, onChange }: { id: string; value: string; disabled: boolean; onChange: (next: string) => void }) {
  const times = value.split(',').map((t) => t.trim()).filter(Boolean)
  const [draft, setDraft] = useState('')
  const write = (list: string[]) => onChange([...new Set(list)].sort().join(', '))
  return (
    <div className="grid gap-1.5">
      <span id={id} className="text-sm font-medium text-ink">Start times</span>
      <div className="flex flex-wrap items-center gap-2">
        {times.map((t) => (
          <span key={t} className="inline-flex min-h-9 items-center gap-1 rounded-full bg-status-confirmed-bg pl-3 text-[14px] font-medium text-navy">
            {timeLabel(t)}
            {!disabled && (
              <button type="button" aria-label={`Remove ${timeLabel(t)}`} onClick={() => write(times.filter((x) => x !== t))} className={`flex size-11 items-center justify-center rounded-full ${FOCUS}`}>
                <X size={14} aria-hidden="true" />
              </button>
            )}
          </span>
        ))}
        {!disabled && (
          <span className="inline-flex items-center gap-1.5">
            <label className="sr-only" htmlFor={`${id}-add`}>Add a start time</label>
            <input id={`${id}-add`} type="time" value={draft} onChange={(e) => setDraft(e.target.value)} className={`min-h-11 rounded-xl border border-input-border bg-surface px-2 text-[14px] ${FOCUS}`} />
            <button type="button" disabled={!draft} onClick={() => { write([...times, draft]); setDraft('') }} className={`min-h-11 rounded-xl border border-input-border bg-surface px-3 text-[14px] font-semibold text-navy disabled:opacity-60 ${FOCUS}`}>
              + Add a time
            </button>
          </span>
        )}
      </div>
    </div>
  )
}

/** One card per service (spec section 7), closed to a one-line summary until opened. The id and the off-site flag are structural and not editable. */
export function ServiceCard({ service, canEdit, defaultOpen = false }: { service: AdminService; canEdit: boolean; defaultOpen?: boolean }) {
  const queryClient = useQueryClient()
  const serverKey = JSON.stringify(service)
  const base = toForm(service)
  const [form, setForm] = useState<ServiceForm>(base)
  const [saved, setSaved] = useState(false)
  const [open, setOpen] = useState(defaultOpen)
  const bodyId = useId()
  const id = service.id

  useEffect(() => setForm(toForm(JSON.parse(serverKey) as AdminService)), [serverKey])

  const payload = toPayload(base, form, service.hasSessions)
  const dirty = Object.keys(payload).length > 0

  const save = useMutation({
    mutationFn: () => updateServiceSettings(service.id, payload),
    onSuccess: () => {
      setSaved(true)
      queryClient.invalidateQueries({ queryKey: ['admin-settings'] })
      queryClient.invalidateQueries({ queryKey: ['admin-schedule'] })
    },
  })

  const set = <K extends keyof ServiceForm>(key: K, value: ServiceForm[K]) => {
    setSaved(false)
    save.reset()
    setForm((f) => ({ ...f, [key]: value }))
  }

  const feeRules: FeeRule[] = service.sponsorFeeAllowed || service.feeRule === 'per_sponsor' ? ['none', 'flat', 'per_sponsor'] : ['none', 'flat']

  return (
    <section aria-label={`${service.name} settings`} className={`overflow-hidden rounded-2xl bg-surface ${open ? 'border-2 border-navy' : 'border border-line'}`}>
      <h3 className="m-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((v) => !v)}
          className={`flex min-h-[72px] w-full flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-left md:px-5 ${FOCUS}`}
        >
          <span className="min-w-0 flex-1 basis-56">
            <span className="block text-[16px] font-semibold text-ink">{service.name}</span>
            <span className="block text-[13px] text-ink-muted">{summaryOf(service)}</span>
          </span>
          <span className="flex gap-1" aria-label="Days it can be booked" role="img">
            {WEEKDAYS.map((d) => (
              <span key={d.n} aria-hidden="true" className={`flex size-6 items-center justify-center rounded-md text-[11px] font-semibold ${service.allowedWeekdays.includes(d.n) ? 'bg-navy text-surface' : 'bg-paper-deep text-ink-muted'}`}>{d.initial}</span>
            ))}
          </span>
          <span className="inline-flex items-center gap-1 text-[14px] font-semibold text-navy">
            {open ? 'Editing' : canEdit ? 'Edit' : 'View'}
            <ChevronDown aria-hidden="true" size={18} className={open ? 'rotate-180' : ''} />
          </span>
        </button>
      </h3>
      <AnimatePresence initial={false}>
        {open && (
          <m.div
            id={bodyId}
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: durations.base, ease: [...ease] }}
            className="overflow-hidden"
          >
            <div className="border-t border-line p-4 md:p-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field id={`${id}-name`} label="Name">
                  <Input disabled={!canEdit} maxLength={80} value={form.name} onChange={(e) => set('name', e.target.value)} />
                </Field>
                <Field id={`${id}-description`} label="Description">
                  <Input disabled={!canEdit} maxLength={255} value={form.description} onChange={(e) => set('description', e.target.value)} />
                </Field>
                <div className="grid content-start gap-1.5">
                  <span className="text-sm font-medium text-ink">Fee</span>
                  <div role="radiogroup" aria-label="Fee" className="inline-flex min-h-[44px] rounded-xl bg-paper-deep p-1">
                    {feeRules.map((r) => {
                      const on = form.feeRule === r
                      return (
                        <button
                          key={r}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          disabled={!canEdit}
                          onClick={() => set('feeRule', r)}
                          className={`min-h-11 flex-1 rounded-lg px-3 text-[14px] disabled:opacity-70 ${FOCUS} ${on ? 'bg-surface font-semibold text-navy ring-2 ring-inset ring-navy' : 'font-medium text-ink-muted'}`}
                        >
                          {FEE_LABEL[r]}
                        </button>
                      )
                    })}
                  </div>
                </div>
                {form.feeRule !== 'none' && (
                  <Field id={`${id}-price`} label="Price ₱">
                    <Input inputMode="decimal" disabled={!canEdit} value={form.price} onChange={(e) => set('price', e.target.value)} />
                  </Field>
                )}
                <Field id={`${id}-duration`} label="Takes (minutes)">
                  <Input type="number" min={15} max={480} disabled={!canEdit} value={form.durationMinutes} onChange={(e) => set('durationMinutes', e.target.value)} />
                </Field>
                <Field id={`${id}-lead`} label="Book ahead (days)">
                  <Input type="number" min={0} max={365} disabled={!canEdit} value={form.leadTimeDays} onChange={(e) => set('leadTimeDays', e.target.value)} />
                </Field>
                <Field id={`${id}-capacity`} label="A day at most">
                  <Input type="number" min={1} max={50} placeholder="No limit" disabled={!canEdit} value={form.dailyCapacity} onChange={(e) => set('dailyCapacity', e.target.value)} />
                </Field>
                <div className="sm:col-span-2">
                  <WeekdayPicker legend="Days it can be booked" value={form.allowedWeekdays} disabled={!canEdit} onChange={(next) => set('allowedWeekdays', next)} />
                </div>
              </div>

              {service.hasSessions && (
                <div className="mt-5 flex flex-col gap-4 rounded-xl bg-paper p-4">
                  <h4 className="text-[15px] font-semibold text-navy">Group sessions</h4>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <SessionTimes id={`${id}-session-times`} value={form.sessionTimes} disabled={!canEdit} onChange={(v) => set('sessionTimes', v)} />
                    </div>
                    <Field id={`${id}-session-capacity`} label="People a session">
                      <Input type="number" min={1} max={200} disabled={!canEdit} value={form.sessionCapacity} onChange={(e) => set('sessionCapacity', e.target.value)} />
                    </Field>
                    <Field id={`${id}-session-duration`} label="Session length (minutes)">
                      <Input type="number" min={15} max={480} disabled={!canEdit} value={form.sessionDurationMinutes} onChange={(e) => set('sessionDurationMinutes', e.target.value)} />
                    </Field>
                    <div className="sm:col-span-2">
                      <WeekdayPicker legend="Session days" value={form.sessionWeekdays} disabled={!canEdit} onChange={(next) => set('sessionWeekdays', next)} />
                    </div>
                  </div>
                </div>
              )}

              {canEdit && (
                <SaveBar
                  label={`Save ${service.name}`}
                  dirty={dirty}
                  pending={save.isPending}
                  savedMessage={saved ? `${service.name} saved.` : null}
                  error={save.isError ? (save.error as Error) : null}
                  onSave={() => save.mutate()}
            onDiscard={() => { setForm(base); setSaved(false); save.reset() }}
                />
              )}
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </section>
  )
}
