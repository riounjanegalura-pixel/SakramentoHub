import type { ReactNode } from 'react'
import { useIsDesktop } from '../../hooks/useIsDesktop'

interface AdaptiveProps {
  mobile: ReactNode
  /** A dedicated desktop page; when absent the mobile page is used. */
  desktop?: ReactNode
  /** The desktop shell; wraps the mobile page when no `desktop` page exists. */
  shell?: (children: ReactNode) => ReactNode
}

/** Renders the phone screen under 1024 px and the website screen above it. */
export function Adaptive({ mobile, desktop, shell }: AdaptiveProps) {
  const isDesktop = useIsDesktop()
  if (!isDesktop) return <>{mobile}</>
  if (desktop !== undefined) return <>{desktop}</>
  return <>{shell ? shell(mobile) : mobile}</>
}
