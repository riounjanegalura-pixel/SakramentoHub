import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import * as m from 'motion/react-m'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import crest from '../../assets/crest-sm.png'
import { updateParishSettings } from '../../lib/data/settings'
import { durations, ease } from '../../lib/motion'
import type { ParishSettings } from '../../lib/types'
import { SaveBar } from './SaveBar'

const SIGNATURE_TYPES = ['image/png', 'image/jpeg']
const SIGNATURE_MAX_BYTES = 200 * 1024
const SECTION = 'flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5 md:p-6'
const H2 = 'font-display text-heading font-semibold text-navy'

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

const toMin = (t: string) => {
  const [h, mm] = t.split(':').map(Number)
  return (h || 0) * 60 + (mm || 0)
}
const fmt = (t: string) => {
  const [h, mm] = t.split(':').map(Number)
  return `${(h % 12) || 12}:${String(mm || 0).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

export function ParishCard({ parish, canEdit }: { parish: ParishSettings; canEdit: boolean }) {
  const queryClient = useQueryClient()
  const serverKey = JSON.stringify(parish)
  const [form, setForm] = useState<ParishSettings>(parish)
  const [saved, setSaved] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  // Re-sync only when the server's values really changed, so a background refetch never wipes what is being typed.
  useEffect(() => setForm(JSON.parse(serverKey) as ParishSettings), [serverKey])

  const changed = (Object.keys(form) as (keyof ParishSettings)[]).filter((k) => form[k] !== parish[k])
  const save = useMutation({
    mutationFn: () => updateParishSettings(Object.fromEntries(changed.map((k) => [k, form[k]])) as Partial<ParishSettings>),
    onSuccess: () => {
      setSaved(true)
      queryClient.invalidateQueries({ queryKey: ['admin-settings'] })
      queryClient.invalidateQueries({ queryKey: ['admin-schedule'] }) // the travel buffer is drawn on the agenda
    },
  })

  const set = <K extends keyof ParishSettings>(key: K, value: ParishSettings[K]) => {
    setSaved(false)
    save.reset()
    setForm((f) => ({ ...f, [key]: value }))
  }

  // A quick check so the common mistakes are caught here; the server decodes the image and has the final say.
  const [signatureError, setSignatureError] = useState<string | null>(null)
  const pickSignature = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // so the same file can be picked again after a removal
    if (!file) return
    if (!SIGNATURE_TYPES.includes(file.type)) return setSignatureError('Choose a PNG or JPEG image.')
    if (file.size > SIGNATURE_MAX_BYTES) return setSignatureError('The image is over 200 KB. Choose a smaller file.')
    try {
      const dataUrl = await readAsDataUrl(file)
      setSignatureError(null)
      set('priestSignature', dataUrl)
    } catch {
      setSignatureError('The image could not be read. Choose another file.')
    }
  }

  const open = Math.min(toMin(form.workingHoursStart), 1440) / 14.4
  const close = Math.min(toMin(form.workingHoursEnd), 1440) / 14.4
  const hoursOk = close > open

  return (
    <section aria-label="Parish" className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
      <div className="flex min-w-0 flex-col gap-5">
        <div className={SECTION} role="group" aria-label="Parish details">
          <h2 className={H2}>Parish</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field id="parish-name" label="Parish name" className="sm:col-span-2">
              <Input disabled={!canEdit} maxLength={120} value={form.parishName} onChange={(e) => set('parishName', e.target.value)} />
            </Field>
            <Field
              id="parish-address"
              label="Address"
              className="sm:col-span-2"
              description="Printed on new certificates"
            >
              <Input disabled={!canEdit} maxLength={160} value={form.parishAddress} onChange={(e) => set('parishAddress', e.target.value)} />
            </Field>
            <Field id="parish-phone" label="Phone">
              <Input disabled={!canEdit} value={form.parishPhone} onChange={(e) => set('parishPhone', e.target.value)} />
            </Field>
          </div>
        </div>

        <div className={SECTION} role="group" aria-label="Priest">
          <h2 className={H2}>Priest</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field id="priest-name" label="Name">
              <Input disabled={!canEdit} maxLength={120} value={form.priestName} onChange={(e) => set('priestName', e.target.value)} />
            </Field>
            <Field id="priest-title" label="Title">
              <Input disabled={!canEdit} maxLength={80} value={form.priestTitle} onChange={(e) => set('priestTitle', e.target.value)} />
            </Field>
          </div>
          <div className="flex flex-col gap-3">
            <Field
              id="priest-signature"
              label="Signature"
              description="Optional. PNG or JPEG, 200 KB at most"
              error={signatureError}
            >
              <Input ref={fileInput} type="file" accept="image/png,image/jpeg" disabled={!canEdit} onChange={pickSignature} className="sr-only" />
            </Field>
            {canEdit && (
              <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => fileInput.current?.click()}>
                Choose a new image
              </Button>
            )}
            {form.priestSignature ? (
              <div className="flex flex-wrap items-center gap-3">
                <img src={form.priestSignature} alt="Signature preview" className="max-h-20 max-w-55 rounded-lg border border-line bg-surface p-2" />
                {canEdit && (
                  <Button type="button" variant="outline" size="sm" onClick={() => { setSignatureError(null); set('priestSignature', null) }}>
                    Remove
                  </Button>
                )}
              </div>
            ) : (
              <p className="text-sm text-ink-muted">No signature image yet.</p>
            )}
          </div>
        </div>

        <div className={SECTION} role="group" aria-label="Hours and slots">
          <h2 className={H2}>Hours and slots</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field id="hours-start" label="Opens">
              <Input type="time" disabled={!canEdit} value={form.workingHoursStart} onChange={(e) => set('workingHoursStart', e.target.value)} />
            </Field>
            <Field id="hours-end" label="Closes">
              <Input type="time" disabled={!canEdit} value={form.workingHoursEnd} onChange={(e) => set('workingHoursEnd', e.target.value)} />
            </Field>
            <Field id="lunch-start" label="Lunch starts" description="No visit starts in or runs through lunch. Same time in both boxes means no break">
              <Input type="time" disabled={!canEdit} value={form.lunchStart} onChange={(e) => set('lunchStart', e.target.value)} />
            </Field>
            <Field id="lunch-end" label="Lunch ends">
              <Input type="time" disabled={!canEdit} value={form.lunchEnd} onChange={(e) => set('lunchEnd', e.target.value)} />
            </Field>
            <div className="grid content-start gap-1.5">
              <span className="text-sm font-medium text-ink">Slot step</span>
              <div role="radiogroup" aria-label="Slot step" className="inline-flex min-h-[44px] rounded-xl bg-paper-deep p-1">
                {[15, 30, 60].map((n) => {
                  const on = form.slotStepMinutes === n
                  return (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      disabled={!canEdit}
                      onClick={() => set('slotStepMinutes', n)}
                      className={`min-h-11 flex-1 rounded-lg px-3 text-[14px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-70 ${on ? 'bg-surface font-semibold text-navy ring-2 ring-inset ring-navy' : 'font-medium text-ink-muted'}`}
                    >
                      {n} min
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
          <div
            role="img"
            aria-label={hoursOk ? `The working day: ${fmt(form.workingHoursStart)} to ${fmt(form.workingHoursEnd)} in ${form.slotStepMinutes}-minute slots` : 'The working hours end before they start'}
          >
            <div className="relative h-3 overflow-hidden rounded-full bg-paper-deep">
              {hoursOk && (
                <m.div
                  className="absolute inset-y-0 rounded-full bg-navy"
                  initial={false}
                  animate={{ left: `${open}%`, width: `${close - open}%` }}
                  transition={{ duration: durations.base, ease: [...ease] }}
                />
              )}
            </div>
            <div aria-hidden="true" className="mt-1.5 flex justify-between text-[12px] text-ink-muted">
              <span>12 AM</span><span>6 AM</span><span>12 PM</span><span>6 PM</span><span>12 AM</span>
            </div>
          </div>
          <Field id="travel-buffer" label="Travel buffer" description="Minutes kept free before off-site visits" className="max-w-[260px]">
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="icon" aria-label="Decrease travel buffer" disabled={!canEdit || form.travelBufferMinutes <= 0} onClick={() => set('travelBufferMinutes', Math.max(0, form.travelBufferMinutes - 5))}>
                &minus;
              </Button>
              <Input id="travel-buffer" type="number" min={0} max={120} step={5} disabled={!canEdit} value={form.travelBufferMinutes} onChange={(e) => set('travelBufferMinutes', Number(e.target.value || 0))} className="text-center" />
              <Button type="button" variant="outline" size="icon" aria-label="Increase travel buffer" disabled={!canEdit || form.travelBufferMinutes >= 120} onClick={() => set('travelBufferMinutes', Math.min(120, form.travelBufferMinutes + 5))}>
                +
              </Button>
            </div>
          </Field>
        </div>

        {canEdit && (
          <SaveBar
            label="Save parish settings"
            dirty={changed.length > 0}
            pending={save.isPending}
            savedMessage={saved ? 'Parish details saved.' : null}
            error={save.isError ? (save.error as Error) : null}
            onSave={() => save.mutate()}
            onDiscard={() => { setForm(parish); setSaved(false); save.reset() }}
          />
        )}
      </div>

      <aside aria-label="Printed on certificates" className="rounded-2xl border border-line bg-surface p-5 xl:sticky xl:top-4">
        <h2 className={`${H2} mb-3`}>Printed on certificates</h2>
        <div className="flex flex-col items-center gap-1.5 rounded-xl border border-line bg-paper px-4 py-6 text-center">
          <img src={crest} alt="" className="size-12 object-contain" />
          <p className="font-display text-[16px] font-semibold text-navy">{form.parishName || 'Parish name'}</p>
          <p className="text-[12px] text-ink-muted">{form.parishAddress || 'Parish address'}</p>
          <p className="mt-2 text-[12px] text-ink-muted">This certifies that the entry below is true.</p>
          {form.priestSignature ? <img src={form.priestSignature} alt="" className="mt-2 max-h-12 max-w-[150px]" /> : <span className="mt-4" />}
          <span aria-hidden="true" className="h-px w-40 bg-hollow" />
          <p className="text-[13px] font-semibold text-ink">{form.priestName || 'Priest name'}</p>
          <p className="text-[12px] text-ink-muted">{form.priestTitle}</p>
        </div>
        <p className="mt-3 text-[13px] text-ink-muted">Entries already in the register keep the address they were recorded with.</p>
      </aside>
    </section>
  )
}
