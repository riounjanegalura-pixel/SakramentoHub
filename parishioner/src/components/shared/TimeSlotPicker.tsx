import { useRef, type KeyboardEvent } from 'react'
import { addMinutesToTime, formatTime } from '../../lib/domain'
import { cn } from '../../lib/utils'

interface TimeSlotPickerProps {
  starts: string[]
  value: string | null
  onChange: (start: string) => void
  labelId: string
  /** When given, each time also shows when it ends, so a person sees the whole slot. */
  durationMinutes?: number
}

/** Free start times as a radiogroup: one tab stop (the chosen time, else the first),
 * arrow keys move between times and choose, like native radios. */
export function TimeSlotPicker({ starts, value, onChange, labelId, durationMinutes }: TimeSlotPickerProps) {
  const refs = useRef<Array<HTMLButtonElement | null>>([])

  if (starts.length === 0) {
    return <p className="text-body text-ink-muted">No free times left on this day. Please pick another date.</p>
  }

  const focusable = starts.includes(value ?? '') ? value : starts[0]

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (delta === 0) return
    e.preventDefault()
    const target = (index + delta + starts.length) % starts.length
    refs.current[target]?.focus()
    onChange(starts[target])
  }

  return (
    <div role="radiogroup" aria-labelledby={labelId} aria-required="true" className="grid grid-cols-2 gap-3">
      {starts.map((start, index) => (
        <button
          key={start}
          ref={(el) => {
            refs.current[index] = el
          }}
          type="button"
          role="radio"
          aria-checked={value === start}
          aria-label={formatTime(start)}
          aria-description={durationMinutes ? `until ${formatTime(addMinutesToTime(start, durationMinutes))}` : undefined}
          tabIndex={start === focusable ? 0 : -1}
          onClick={() => onChange(start)}
          onKeyDown={(e) => onKeyDown(e, index)}
          className={cn(
            'min-h-14 rounded-xl border-[1.5px] px-2 text-body font-semibold tabular-nums',
            'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus',
            value === start ? 'border-navy bg-navy text-white' : 'border-input-border bg-surface text-ink hover:bg-paper-deep',
          )}
        >
          {formatTime(start)}
          {durationMinutes ? <span aria-hidden="true" className="block text-label font-normal opacity-80">until {formatTime(addMinutesToTime(start, durationMinutes))}</span> : null}
        </button>
      ))}
    </div>
  )
}
