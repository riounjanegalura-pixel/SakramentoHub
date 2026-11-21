import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { Outlet, useLocation, useMatches } from 'react-router-dom'
import { BottomNav } from './BottomNav'
import { ShellHostContext, type ShellHost } from './shell-host'

/** Where "skip to main content" and a route change without an h1 send focus. */
function mainTarget(region: HTMLElement): HTMLElement {
  return document.getElementById('main') ?? region.querySelector('main') ?? region
}

function focusTarget(el: HTMLElement) {
  if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1')
  el.focus()
}

/**
 * The one layout every route renders inside (spec sections 6 and 10): skip link, route announcer,
 * focus management on navigation, and the phone bottom bar when the screen asks for it.
 */
export function RootLayout() {
  const location = useLocation()
  const matches = useMatches()
  // One screen per route definition: a step or id change inside the same route is not a scene change.
  const sceneId = matches[matches.length - 1]?.id ?? location.pathname
  const [bar, setBar] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const [initialKey] = useState(location.key)
  const regionRef = useRef<HTMLDivElement>(null)
  const lastPath = useRef(location.pathname)

  const animateEntry = location.key !== initialKey
  const host = useMemo<ShellHost>(() => ({ showBar: setBar, animateEntry }), [animateEntry])

  // A new page (not the first load, not a search-param change): focus its h1 and announce its title.
  useEffect(() => {
    if (lastPath.current === location.pathname) return
    lastPath.current = location.pathname
    const region = regionRef.current
    if (!region) return
    const heading = region.querySelector('h1')
    focusTarget(heading ?? mainTarget(region))
    setAnnouncement(heading?.textContent?.trim() || document.title)
  }, [location.pathname])

  const skip = (e: MouseEvent<HTMLAnchorElement>) => {
    if (!regionRef.current) return
    e.preventDefault()
    focusTarget(mainTarget(regionRef.current))
  }

  return (
    <ShellHostContext.Provider value={host}>
      <a
        href="#main"
        onClick={skip}
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-3 focus:font-medium focus:text-ink focus:outline-2 focus:outline-offset-2 focus:outline-focus"
      >
        Skip to main content
      </a>
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </div>
      <div ref={regionRef}>
        {/* A new screen replaces the old one at once: the frame, menus and tabs never animate. Content that should ease in does so inside its own pane. */}
        <div key={sceneId}>
          <Outlet />
        </div>
      </div>
      {bar && <BottomNav />}
    </ShellHostContext.Provider>
  )
}
