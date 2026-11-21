import * as React from 'react'
import { cn } from '../../lib/utils'

/**
 * The one navy surface a screen is allowed: the cover of Home, the header band of a booking, the amount on Pay.
 * White text, `text-on-navy` for the quieter lines, one gold hairline underneath. A screen draws at most one
 * (a test counts them in the source and the browser sweep counts them on the page), because a second navy block
 * would turn "the thing to do" into "one of two things to do".
 */
export function Panel({
  as: Comp = 'section',
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLElement> & { as?: 'section' | 'div' | 'header' | 'article' }) {
  return (
    <Comp
      data-panel=""
      className={cn('flex flex-col gap-3 rounded-2xl border-b-[3px] border-gold bg-navy p-6 text-white', className)}
      {...props}
    >
      {children}
    </Comp>
  )
}
