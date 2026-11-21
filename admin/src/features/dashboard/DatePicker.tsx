import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../components/ui/dialog'
import { fetchSchedule } from '../../lib/data/schedule'
import { monthBounds, monthTitle, shiftMonth } from '../../lib/dates'
import { MonthGrid } from './MonthGrid'

const NAV = 'flex size-11 items-center justify-center rounded-[10px] text-navy hover:bg-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus'

/**
 * The phone's month: the week strip shows seven days, this dialog opens the rest. It has its own month so paging
 * through it does not move the page; "Show this day" applies the choice.
 */
export function DatePicker({
  open,
  onOpenChange,
  selected,
  today,
  onApply,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  selected: string
  today: string
  onApply: (date: string) => void
}) {
  const [month, setMonth] = useState(selected)
  const [pick, setPick] = useState(selected)
  useEffect(() => {
    if (open) {
      setMonth(selected)
      setPick(selected)
    }
  }, [open, selected])

  const { start, end } = monthBounds(month)
  const schedule = useQuery({ queryKey: ['admin-schedule', start, end], queryFn: () => fetchSchedule(start, end), enabled: open })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="min-h-[440px] max-w-[340px] content-start rounded-2xl border-line p-4 sm:max-w-[340px]">
        <DialogDescription className="sr-only">Choose a day to show on the Dashboard.</DialogDescription>
        <div className="mb-2 flex items-center justify-between">
          <button type="button" aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))} className={NAV}>
            <ChevronLeft size={20} aria-hidden="true" />
          </button>
          <DialogTitle className="font-display text-[19px] font-semibold text-navy">{monthTitle(month)}</DialogTitle>
          <button type="button" aria-label="Next month" onClick={() => setMonth(shiftMonth(month, 1))} className={NAV}>
            <ChevronRight size={20} aria-hidden="true" />
          </button>
        </div>
        <MonthGrid month={month} selected={pick} today={today} days={schedule.data?.days ?? []} onSelect={setPick} cellClass="h-10" />
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink-muted">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="size-[5px] rounded-full bg-navy" />
            Has bookings
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="line-through">12</span>
            Parish closed
          </span>
        </div>
        <div className="mt-auto flex gap-2 pt-2">
          <button
            type="button"
            onClick={() => {
              setMonth(today)
              setPick(today)
            }}
            className="h-11 flex-1 rounded-xl border border-input-border bg-surface text-[14px] font-semibold text-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            Go to today
          </button>
          <button
            type="button"
            onClick={() => {
              onApply(pick)
              onOpenChange(false)
            }}
            className="h-11 flex-1 rounded-xl bg-navy text-[14px] font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            Show this day
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
