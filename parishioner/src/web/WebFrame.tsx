import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import { AppHeader } from '../components/shared/AppHeader'
import { Footer } from './Footer'
import { TopNav } from './TopNav'

/**
 * The website around a signed-in page: glass top bar, a 960 px content column, footer (spec section 6).
 * `header` is a phone screen's AppHeader; here it becomes the page heading block, not a navy bar.
 */
export function WebFrame({ children, header, width = 'max-w-[960px]' }: { children: ReactNode; header?: ReactNode; width?: string }) {
  const heading =
    isValidElement(header) && header.type === AppHeader
      ? cloneElement(header as ReactElement<{ variant?: 'phone' | 'web' }>, { variant: 'web' })
      : header
  const isHeading = heading !== header

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <TopNav />
      <main id="main" tabIndex={-1} className={`mx-auto w-full flex-1 px-6 py-8 outline-none ${width}`}>
        {header && isHeading && (
          <div className="mb-6">{heading}</div>
        )}
        {header && !isHeading && <div className="mb-6 overflow-hidden rounded-2xl">{header}</div>}
        {children}
      </main>
      <Footer />
    </div>
  )
}
