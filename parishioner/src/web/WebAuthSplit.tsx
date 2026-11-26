import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CalendarDays, FileText, ShieldCheck } from 'lucide-react'
import { fetchParishInfo } from '../lib/data/parish'
import crest from '../assets/crest.png'
import arch from '../assets/art/arch.svg'
import { AuthSplitContext } from '../features/auth/authForm'

const POINTS = [
  { icon: CalendarDays, text: 'Book a sacrament and follow each step online' },
  { icon: FileText, text: 'Keep your documents ready for your bookings' },
  { icon: ShieldCheck, text: 'Check a certificate issued by the parish' },
] as const

/**
 * Sign-in, registration and forgot password on a desktop: a navy brand panel on the left, the form on the right.
 * Only desktop gets the panel; a phone shows the form alone (the routes pick this component with Adaptive).
 */
export function WebAuthSplit({ children }: { children: ReactNode }) {
  const { data: parish } = useQuery({ queryKey: ['parish'], queryFn: fetchParishInfo })

  return (
    <div className="grid min-h-dvh bg-paper lg:grid-cols-2">
      <aside aria-label="About SakramentoHub" className="relative flex flex-col justify-center overflow-hidden border-r-[3px] border-gold bg-navy p-12 text-white">
        <img src={arch} alt="" aria-hidden="true" className="pointer-events-none absolute -bottom-6 -right-6 w-64 opacity-30" />
        <img src={crest} alt="" aria-hidden="true" className="mb-6 h-36 w-auto self-start" />
        <p className="font-display text-display font-semibold">{parish?.name ?? 'St. Peter the Apostle Parish'}</p>
        <p className="mt-2 max-w-md text-on-navy">Your parish, online: sacraments, documents and certificates in one place.</p>
        <ul className="mt-8 flex max-w-md flex-col gap-4">
          {POINTS.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-start gap-3 text-white">
              <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full border border-on-navy text-white">
                <Icon size={18} />
              </span>
              <span className="pt-1">{text}</span>
            </li>
          ))}
        </ul>
        <p className="mt-10 text-sm text-on-navy">
          Need to check a certificate?{' '}
          <Link
            to="/verify"
            className="inline-flex min-h-11 items-center font-semibold text-white underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Verify a certificate
          </Link>
        </p>
      </aside>
      <main className="flex justify-center bg-paper">
        <AuthSplitContext.Provider value>{children}</AuthSplitContext.Provider>
      </main>
    </div>
  )
}
