import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, ChevronRight, CircleCheck, Plus } from 'lucide-react'
import * as m from 'motion/react-m'
import { AnimatePresence } from 'motion/react'
import { AdminLayout } from '../../components/shared/AdminLayout'
import { LoadError } from '../../components/shared/LoadError'
import { Pagination } from '../../components/shared/Pagination'
import { Reveal } from '../../components/shared/Reveal'
import { Skeleton } from '../../components/shared/Skeleton'
import { UnderlineTabs } from '../../components/shared/UnderlineTabs'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../components/ui/dialog'
import {
  createParishEvent,
  deleteParishEvent,
  fetchParishEvents,
  updateParishEvent,
  type ParishEventInput,
} from '../../lib/data/parish-events'
import { EVENT_CATEGORIES, eventCategoryLabel, formatManilaTime } from '../../lib/domain'
import { durations, ease, staggerDelay } from '../../lib/motion'
import { cn } from '../../lib/utils'
import type { AdminParishEvent, ParishEventCategory } from '../../lib/types'
import { BTN_DANGER, BTN_OUTLINE, BTN_PRIMARY, REG_DIALOG, REG_DIALOG_NARROW, REG_INPUT, RegField } from '../register/registerForm'

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus'
const NO_EVENTS: AdminParishEvent[] = []

type View = 'upcoming' | 'past'

const MANILA = 'Asia/Manila'
const MONTH = new Intl.DateTimeFormat('en-US', { timeZone: MANILA, month: 'short' })
const DAY = new Intl.DateTimeFormat('en-US', { timeZone: MANILA, day: 'numeric' })
const WEEKDAY_DATE = new Intl.DateTimeFormat('en-US', { timeZone: MANILA, weekday: 'short', month: 'short', day: 'numeric' })
const PARTS = new Intl.DateTimeFormat('en-US', { timeZone: MANILA, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

/** "Sun, Nov 8 · 8:00 AM · Main church", in parish time. */
function metaText(event: AdminParishEvent): string {
  return [WEEKDAY_DATE.format(new Date(event.date)), formatManilaTime(event.date), event.location].join(' · ')
}

/** The event's date and time of day, in parish time, as the two form inputs need them. */
function toDateAndTime(iso: string): { date: string; time: string } {
  const p: Record<string, string> = {}
  for (const part of PARTS.formatToParts(new Date(iso))) p[part.type] = part.value
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` }
}

type FieldErrors = Partial<Record<'title' | 'date' | 'time', string>>

/** Reads the form into the shape create and update take; reports what is missing in words. */
function readForm(form: HTMLFormElement): { input?: ParishEventInput; errors: FieldErrors } {
  const data = new FormData(form)
  const get = (name: string) => String(data.get(name) ?? '').trim()
  const errors: FieldErrors = {}
  if (!get('title')) errors.title = 'Enter a title.'
  if (!get('date')) errors.date = 'Choose a date.'
  if (!get('time')) errors.time = 'Choose a time.'
  if (Object.keys(errors).length > 0) return { errors }
  return {
    errors,
    input: {
      title: get('title'),
      // The time typed is parish time; naming the offset keeps a browser or server in another zone from shifting it.
      date: `${get('date')}T${get('time')}:00+08:00`,
      imageUrl: get('imageUrl') || undefined,
      category: (get('category') as ParishEventCategory) || 'general',
    },
  }
}

/**
 * Parish events (staff/admin): what parishioners see on the Events tab, as dated rows.
 * Add and edit share one dialog; Delete is reachable only from inside Edit, behind its own confirmation.
 */
export function ParishEventsScreen() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [view, setView] = useState<View>('upcoming')
  // The dialog: closed, adding, or editing one event.
  const [dialog, setDialog] = useState<'add' | AdminParishEvent | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin-parish-events', view, page],
    queryFn: () => fetchParishEvents(page, view),
  })
  // The other tab's count, so both tabs say how many they hold.
  const other: View = view === 'upcoming' ? 'past' : 'upcoming'
  const otherQuery = useQuery({
    queryKey: ['admin-parish-events', other, 1],
    queryFn: () => fetchParishEvents(1, other),
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin-parish-events'] })

  const createMutation = useMutation({
    mutationFn: createParishEvent,
    onSuccess: () => {
      invalidate()
      setDialog(null)
      setFormError(null)
      setSaved('Event added.')
    },
    onError: (err: Error) => setFormError(err.message),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: ParishEventInput }) => updateParishEvent(id, input),
    onSuccess: () => {
      invalidate()
      setDialog(null)
      setFormError(null)
      setSaved('Event saved.')
    },
    onError: (err: Error) => setFormError(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteParishEvent,
    onSuccess: () => {
      invalidate()
      setConfirmingDelete(false)
      setDialog(null)
      setDeleteError(null)
      setSaved('Event deleted.')
    },
    onError: (err: Error) => setDeleteError(err.message),
  })

  function openDialog(next: 'add' | AdminParishEvent) {
    setSaved(null)
    setFormError(null)
    setFieldErrors({})
    setDeleteError(null)
    setDialog(next)
  }

  function closeDialog() {
    setDialog(null)
    setConfirmingDelete(false)
    setFormError(null)
    setFieldErrors({})
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaved(null)
    const { input, errors } = readForm(e.currentTarget)
    setFieldErrors(errors)
    if (!input) return
    if (dialog === 'add') createMutation.mutate(input)
    else if (dialog) updateMutation.mutate({ id: dialog.id, input })
  }

  function chooseView(value: View) {
    setView(value)
    setPage(1)
  }

  const events = data?.data ?? NO_EVENTS
  const meta = data?.meta
  const emptyText = view === 'upcoming' ? 'No upcoming events' : 'No past events'
  const editing = dialog && dialog !== 'add' ? dialog : null
  const pending = createMutation.isPending || updateMutation.isPending
  const count = (v: View) => (v === view ? meta?.total : otherQuery.data?.meta.total)

  return (
    <AdminLayout title="Parish events">
      <div className="flex w-full max-w-[1760px] flex-col gap-4">
        <div className="z-10 flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-b border-line bg-paper md:sticky md:top-[66px]">
          <UnderlineTabs
            label="Event views"
            value={view}
            onChange={chooseView}
            className="border-b-0"
            tabs={[
              { value: 'upcoming', label: 'Upcoming', count: count('upcoming') },
              { value: 'past', label: 'Past', count: count('past') },
            ]}
          />
          <button type="button" onClick={() => openDialog('add')} className={cn(BTN_PRIMARY, 'mb-1.5 gap-2 max-sm:w-full')}>
            <Plus size={18} aria-hidden="true" />
            Add event
          </button>
        </div>

        <AnimatePresence>
          {saved && (
            <m.p
              key={saved}
              role="status"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: durations.base, ease: [...ease] }}
              className="flex items-center gap-2 text-[14px] font-medium text-status-done-fg"
            >
              <CircleCheck size={18} aria-hidden="true" />
              {saved}
            </m.p>
          )}
        </AnimatePresence>

        {isLoading && (
          <div role="status" aria-busy="true" aria-label="Loading events" className="flex flex-col gap-3.5 rounded-2xl border border-line bg-surface px-5 py-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex h-[60px] items-center gap-4">
                <Skeleton className="size-14 shrink-0 rounded-xl" />
                <div className="flex flex-1 flex-col gap-2">
                  <Skeleton className="h-4 w-3/5 max-w-xs" />
                  <Skeleton className="h-3 w-2/5 max-w-[200px]" />
                </div>
                <Skeleton className="hidden h-7 w-20 rounded-full sm:block" />
              </div>
            ))}
          </div>
        )}

        {isError && (
          <Reveal>
            <LoadError title="Events didn’t load" message="Check your connection, then try again." detail={(error as Error).message} onRetry={() => void refetch()} />
          </Reveal>
        )}

        {!isLoading && !isError && events.length === 0 && (
          <Reveal>
            <section className="flex flex-col items-center gap-2 rounded-2xl border border-line bg-surface px-6 py-14 text-center">
              <div role="img" aria-label="Calendar" className="flex size-12 items-center justify-center rounded-full bg-paper-deep text-navy">
                <CalendarDays size={24} aria-hidden="true" />
              </div>
              <p className="text-[17px] font-semibold">{emptyText}</p>
              <p className="text-[14px] text-ink-muted">Parishioners see events on their Events tab.</p>
            </section>
          </Reveal>
        )}

        {events.length > 0 && !isError && (
          <section aria-label="Events" className="overflow-hidden rounded-2xl border border-line bg-surface">
            <ul>
              {events.map((event, i) => {
                const next = view === 'upcoming' && page === 1 && i === 0
                const when = new Date(event.date)
                return (
                  <m.li
                    key={event.id}
                    initial={false}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: durations.base, ease: [...ease], delay: staggerDelay(i) }}
                    className="border-t border-line first:border-t-0"
                  >
                    <div className="flex items-center gap-4 px-4 py-3.5 sm:px-5">
                      <div
                        aria-hidden="true"
                        className={cn('flex h-[60px] w-14 flex-none flex-col items-center justify-center rounded-xl border', next ? 'border-navy bg-navy text-white' : 'border-line bg-paper text-navy')}
                      >
                        <span className={cn('text-[13px] leading-tight', next ? 'text-white/85' : 'text-ink-muted')}>{MONTH.format(when)}</span>
                        <span className="font-display text-2xl font-semibold leading-tight">{DAY.format(when)}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-[16px] font-semibold">
                          {next && <span className="sr-only">Next event. </span>}
                          {event.title}
                        </p>
                        <p className="mt-0.5 break-words text-[14px] text-ink-muted">{metaText(event)}</p>
                        <span className="mt-1.5 inline-flex h-6 items-center rounded-full bg-paper-deep px-2.5 text-[13px] font-medium text-ink-muted sm:hidden">{eventCategoryLabel(event.category)}</span>
                      </div>
                      <span className="hidden h-7 flex-none items-center rounded-full bg-paper-deep px-3 text-[13px] font-medium text-ink-muted sm:inline-flex">{eventCategoryLabel(event.category)}</span>
                      <button
                        type="button"
                        aria-label={`Edit ${event.title}`}
                        onClick={() => openDialog(event)}
                        className={`inline-flex h-11 min-w-11 flex-none items-center justify-center rounded-xl border border-input-border bg-surface px-4 text-[14px] font-semibold text-navy sm:min-w-[72px] ${FOCUS}`}
                      >
                        <span className="max-sm:sr-only">Edit</span>
                        <ChevronRight size={18} aria-hidden="true" className="text-ink-muted sm:hidden" />
                      </button>
                    </div>
                  </m.li>
                )
              })}
            </ul>
            {meta && <Pagination meta={meta} onPageChange={setPage} />}
          </section>
        )}
      </div>

      {dialog && (
        <Dialog open onOpenChange={(open) => !open && closeDialog()}>
          <DialogContent className={REG_DIALOG} aria-label={editing ? 'Edit event' : 'Add event'}>
            <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
              <div>
                <DialogTitle className="mb-1 font-display text-2xl font-semibold leading-tight text-navy">{editing ? 'Edit event' : 'Add event'}</DialogTitle>
                <DialogDescription className="text-[14px] leading-normal text-ink-muted">
                  {editing ? `Posted by ${editing.createdByName ?? 'the office'}` : 'Parishioners see this on the Events tab.'}
                </DialogDescription>
              </div>
              <EventFields defaultValues={editing ?? undefined} errors={fieldErrors} />
              {formError && <p role="alert" className="rounded-xl bg-status-rejected-bg px-3.5 py-3 text-[14px] font-medium text-danger">{formError}</p>}
              <div className="flex flex-col-reverse gap-2.5 pt-2 md:flex-row md:items-center md:justify-end">
                {editing && (
                  <button
                    type="button"
                    onClick={() => { setDeleteError(null); setConfirmingDelete(true) }}
                    className={`inline-flex min-h-11 items-center justify-center text-[14px] font-semibold text-danger underline underline-offset-[3px] md:mr-auto ${FOCUS}`}
                  >
                    Delete event
                  </button>
                )}
                <button type="button" onClick={closeDialog} className={BTN_OUTLINE}>Cancel</button>
                <button type="submit" disabled={pending} className={BTN_PRIMARY}>
                  {pending ? 'Saving…' : editing ? 'Save changes' : 'Add event'}
                </button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {editing && confirmingDelete && (
        <Dialog open onOpenChange={(open) => !open && setConfirmingDelete(false)}>
          <DialogContent className={REG_DIALOG_NARROW} aria-label="Delete this event">
            <div>
              <DialogTitle className="mb-1.5 font-display text-2xl font-semibold leading-tight text-navy">Delete this event?</DialogTitle>
              <DialogDescription className="text-[14px] leading-normal text-ink-muted">Parishioners will no longer see it. This can’t be undone.</DialogDescription>
            </div>
            <div className="rounded-xl border border-line bg-paper px-4 py-3.5">
              <span className="block break-words text-[16px] font-semibold">{editing.title}</span>
              <span className="block break-words text-[13px] text-ink-muted">{metaText(editing)}</span>
            </div>
            {deleteError && <p role="alert" className="text-[14px] font-medium text-danger">{deleteError}</p>}
            <div className="flex flex-col-reverse gap-2.5 pt-2 md:flex-row md:justify-end">
              <button type="button" onClick={() => setConfirmingDelete(false)} className={BTN_OUTLINE}>Keep event</button>
              <button type="button" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate(editing.id)} className={BTN_DANGER}>
                {deleteMutation.isPending ? 'Deleting…' : 'Delete event'}
              </button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </AdminLayout>
  )
}

/** Title, date, time, category and image link: the add and edit dialog's fields. defaultValues pre-fills them for edit.
 * Required fields say "Required" in words inside their label (not a colour or an asterisk). */
function EventFields({ defaultValues, errors }: { defaultValues?: AdminParishEvent; errors: FieldErrors }) {
  const when = defaultValues ? toDateAndTime(defaultValues.date) : undefined
  const invalid = (key: keyof FieldErrors) => (errors[key] ? true : undefined)
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <RegField label="Title" htmlFor="ev-title" required error={errors.title} className="sm:col-span-2">
        <input id="ev-title" name="title" required aria-invalid={invalid('title')} placeholder="Name of the event" defaultValue={defaultValues?.title} className={REG_INPUT} />
      </RegField>
      <RegField label="Date" htmlFor="ev-date" required error={errors.date}>
        <input id="ev-date" name="date" type="date" required aria-invalid={invalid('date')} defaultValue={when?.date} className={REG_INPUT} />
      </RegField>
      <RegField label="Time" htmlFor="ev-time" required error={errors.time}>
        <input id="ev-time" name="time" type="time" required aria-invalid={invalid('time')} defaultValue={when?.time} className={REG_INPUT} />
      </RegField>
      <RegField label="Category" htmlFor="ev-category">
        <select id="ev-category" name="category" defaultValue={defaultValues?.category ?? 'general'} className={REG_INPUT}>
          {/* An event stored with a category from before the current list keeps it as an
              extra option, so saving an edit does not silently switch it to the first one. */}
          {defaultValues && !EVENT_CATEGORIES.some((c) => c.value === defaultValues.category) && (
            <option value={defaultValues.category}>{eventCategoryLabel(defaultValues.category)}</option>
          )}
          {EVENT_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </RegField>
      <RegField label="Image link" htmlFor="ev-image" optional>
        <input id="ev-image" name="imageUrl" placeholder="https://" defaultValue={defaultValues?.imageUrl ?? ''} className={REG_INPUT} />
      </RegField>
    </div>
  )
}
