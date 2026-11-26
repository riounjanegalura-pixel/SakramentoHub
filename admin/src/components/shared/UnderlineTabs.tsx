import { cn } from '../../lib/utils'

export type UnderlineTab<T extends string> = { value: T; label: string; count?: number }

/**
 * The list tabs: words on a hairline, the chosen one underlined in navy with its count beside it.
 * The underline appears under the chosen tab at once: tabs are switched many times a day, often from the keyboard, and a sliding
 * indicator is a layout animation that runs on the main thread while the next view loads.
 * Tabs wrap on a narrow screen rather than scrolling sideways.
 */
export function UnderlineTabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  className,
}: {
  tabs: UnderlineTab<T>[]
  value: T
  onChange: (value: T) => void
  label: string
  className?: string
}) {
  return (
    <div role="tablist" aria-label={label} className={cn('flex flex-wrap gap-x-7 gap-y-0 border-b border-line', className)}>
      {tabs.map((tab, i) => {
        const active = tab.value === value
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(tab.value)}
            onKeyDown={(e) => {
              const last = tabs.length - 1
              const target = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: last }[e.key as 'Home']
              if (target === undefined) return
              e.preventDefault()
              const next = (target + tabs.length) % tabs.length
              onChange(tabs[next].value)
              ;(e.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus()
            }}
            className={cn(
              'relative -mb-px inline-flex min-h-12 items-center gap-2 text-[15px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
              active ? 'font-semibold text-navy' : 'font-medium text-ink-muted hover:text-navy',
            )}
          >
            {tab.label}
            {tab.count !== undefined && <span className="text-[13px] tabular-nums text-ink-muted">{tab.count}</span>}
            {active && (
              <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[3px] rounded-full bg-navy" />
            )}
          </button>
        )
      })}
    </div>
  )
}
