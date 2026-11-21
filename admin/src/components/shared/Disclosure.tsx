import { useId, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import * as m from 'motion/react-m'
import { AnimatePresence } from 'motion/react'
import { durations, ease } from '../../lib/motion'

/**
 * A titled section that opens and closes. `summary` is the one line you see
 * while it is shut (e.g. "Maria Lopez · born 3 Mar 2026"), so a closed section
 * still tells you what is inside it. Sections can nest.
 */
export function Disclosure({
  title,
  summary,
  defaultOpen = false,
  children,
  className = '',
}: {
  title: string
  summary?: ReactNode
  defaultOpen?: boolean
  children: ReactNode
  className?: string
}) {
  const [open, setOpen] = useState(defaultOpen)
  const id = useId()
  return (
    <section className={`rounded-2xl border border-line bg-surface ${className}`}>
      <h3 className="m-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((v) => !v)}
          className="flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <span className="min-w-0">
            <span className="block text-[15px] font-semibold text-navy">{title}</span>
            {summary && !open && <span className="block truncate text-[13px] text-ink-muted">{summary}</span>}
          </span>
          <m.span aria-hidden="true" className="flex shrink-0 text-ink-muted" animate={{ rotate: open ? 180 : 0 }} transition={{ duration: durations.base, ease: [...ease] }}>
            <ChevronDown size={18} />
          </m.span>
        </button>
      </h3>
      <AnimatePresence initial={false}>
        {open && (
          <m.div
            id={id}
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: durations.base, ease: [...ease] }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-3 border-t border-line px-4 py-4">{children}</div>
          </m.div>
        )}
      </AnimatePresence>
    </section>
  )
}
