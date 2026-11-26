import { useContext, useLayoutEffect, type ReactNode } from 'react'
import { useIsDesktop } from '../../hooks/useIsDesktop'
import { WebFrame } from '../../web/WebFrame'
import { WebPaneContext } from '../../web/WebPane'
import { BottomNav } from './BottomNav'
import { ShellHostContext } from './shell-host'

interface AppShellProps {
  children: ReactNode
  showBottomNav?: boolean
  header?: ReactNode
  /** Opt a screen without a tab bar into the website frame on a desktop; defaults to showBottomNav. */
  webFrame?: boolean
  /** Content width of the website frame on a desktop (a Tailwind max-w class). */
  webWidth?: string
  /**
   * A fixed-position control. It is drawn beside the content, never inside it.
   */
  floating?: ReactNode
}

export function AppShell({ children, showBottomNav = true, header, webFrame, webWidth, floating }: AppShellProps) {
  const isDesktop = useIsDesktop()
  const inPane = useContext(WebPaneContext)
  const host = useContext(ShellHostContext)

  const paneOnly = isDesktop && inPane
  const website = isDesktop && (webFrame ?? showBottomNav)
  const phoneBar = !paneOnly && !website && showBottomNav

  // Inside the app's layout the bar is drawn once by RootLayout and stays mounted between routes; this screen only says it wants it.
  const showBar = host?.showBar
  useLayoutEffect(() => {
    if (!showBar || !phoneBar) return
    showBar(true)
    return () => showBar(false)
  }, [showBar, phoneBar])

  // Inside a desktop pane (Settings) the page's own frame is already there: show the header card and the content only.
  if (paneOnly) {
    return (
      <>
        {header && <div className="mb-6 overflow-hidden rounded-xl">{header}</div>}
        {children}
        {floating}
      </>
    )
  }
  // Tab screens, and screens that opt in with `webFrame`, become pages of the website on a desktop; the rest keep the phone frame.
  if (website) {
    return (
      <>
        <WebFrame header={header} width={webWidth}>{children}</WebFrame>
        {floating}
      </>
    )
  }

  // `data-chrome` scopes the scroll padding (globals.css) to the header and the docked bar actually on screen.
  const chrome = [header ? 'top' : '', showBottomNav ? 'bottom' : ''].filter(Boolean).join(' ')
  return (
    <div className="min-h-dvh bg-paper sm:bg-line/40">
      <div data-app-shell data-chrome={chrome || undefined} className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col bg-paper">
        {header}
        {/* The scene change (fade and rise) is drawn once by RootLayout, so nothing animates here. */}
        <main id="main" tabIndex={-1} className={`flex-1 outline-none ${showBottomNav ? 'pb-[var(--chrome-bottom)]' : ''}`}>
          {children}
        </main>
        {floating}
        {showBottomNav && !host && <BottomNav />}
      </div>
    </div>
  )
}
