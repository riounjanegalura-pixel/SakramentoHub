import { Link } from 'react-router-dom'
import { Panel } from '../../components/shared/Panel'
import { NotificationsLink } from '../../components/shared/NotificationsLink'
import arch from '../../assets/art/arch.svg'
import { Button } from '../../components/ui/button'
import { JourneyRailCompact } from '../../components/shared/JourneyRailCompact'
import { Skeleton } from '../../components/ui/skeleton'
import { SACRAMENT_LABEL, formatDate, formatTime, peso } from '../../lib/domain'
import { useParishInfo } from '../../lib/useParishInfo'
import type { Booking } from '../../lib/types'
import type { NextAction } from './nextAction'

const DEADLINE = new Intl.DateTimeFormat('en-PH', {
  timeZone: 'Asia/Manila',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
})

/** "Fri 14 Oct, 5:00 pm", always in parish time. */
export function formatDeadline(iso: string): string {
  const p = Object.fromEntries(DEADLINE.formatToParts(new Date(iso)).map((x) => [x.type, x.value]))
  return `${p.weekday} ${p.day} ${p.month}, ${p.hour}:${p.minute} ${String(p.dayPeriod).toLowerCase()}`
}

/** Dates, times and amounts are Inter with tabular figures; mono is for reference numbers only. */
const num = (text: string) => <span className="tabular-nums">{text}</span>

const when = (b: Booking) =>
  b.appointmentDate ? (
    <>
      {num(formatDate(b.appointmentDate))}
      {b.appointmentStart ? <> at {num(formatTime(b.appointmentStart))}</> : null}
    </>
  ) : null

/**
 * The cover of Home: the one navy Panel on the screen. A wordmark and the bell across the top, the greeting, then
 * the single next step. The arched window behind is a quiet drawing, never text. Gold is the hairline underneath.
 */
export function HomeCover({ firstName, parishName, children }: { firstName: string; parishName?: string; children: React.ReactNode }) {
  return (
    <Panel as="div" className="relative gap-0 overflow-hidden rounded-none px-5 pb-7 pt-2">
      <img src={arch} alt="" aria-hidden="true" className="pointer-events-none absolute -right-11 -top-1.5 h-[118%] w-auto opacity-30" />
      <div className="relative flex min-h-[60px] items-center justify-between">
        <span aria-hidden="true" className="font-display text-[1.3125rem] font-semibold tracking-tight text-white">SakramentoHub</span>
        <NotificationsLink onNavy />
      </div>
      <div className="relative mb-4">
        <h1 className="text-note font-semibold text-white">Welcome back, {firstName}</h1>
        {parishName && <p className="text-label text-on-navy">{parishName}</p>}
      </div>
      <div className="relative">{children}</div>
    </Panel>
  )
}

/** The next step, inside the cover. No border or shadow: the navy surface is the card. */
function CardFrame({ children }: { children: React.ReactNode }) {
  return (
    <section data-testid="next-action" aria-label="Next for you" className="flex flex-col gap-3.5">
      {children}
    </section>
  )
}

const Heading = () => <p className="text-label font-semibold text-on-navy">Next for you</p>
const Title = ({ children }: { children: React.ReactNode }) => (
  <h2 className="font-display text-display-xl font-semibold text-white lining-nums">{children}</h2>
)
const Detail = ({ children }: { children: React.ReactNode }) => <p className="text-body text-on-navy">{children}</p>
const CTA = 'mt-1 w-full'

export function NextActionSkeleton() {
  return (
    <CardFrame>
      <Heading />
      <Skeleton className="h-9 w-4/5 bg-white/15" />
      <Skeleton className="h-5 w-3/5 bg-white/15" />
      <Skeleton className="mt-1 h-14 w-full rounded-xl bg-white/15" />
    </CardFrame>
  )
}

export function NextActionError({ onRetry }: { onRetry: () => void }) {
  return (
    <CardFrame>
      <Heading />
      <Title>We couldn&apos;t load your bookings.</Title>
      <Detail>Check your connection and try again. Everything else on this page still works.</Detail>
      <Button type="button" size="lg" variant="inverse" className={CTA} onClick={onRetry}>
        Retry
      </Button>
    </CardFrame>
  )
}

function LapsedCard({ action }: { action: Extract<NextAction, { kind: 'lapsed' }> }) {
  const { data: parish } = useParishInfo()
  const b = action.booking
  return (
    <CardFrame>
      <Heading />
      <Title>The payment window for your {SACRAMENT_LABEL[b.sacrament]} booking ended</Title>
      <Detail>
        The parish office may cancel it unless they hear from you.
        {parish?.phone ? <> Call the office on {num(parish.phone)}.</> : null}
      </Detail>
      <Button asChild size="lg" variant="inverse" className={CTA}>
        <Link to={`/booking/history/${b.id}`}>{action.cta}</Link>
      </Button>
      <JourneyRailCompact booking={b} onNavy className="mt-2" />
    </CardFrame>
  )
}

export function NextActionCard({ action }: { action: NextAction }) {
  if (action.kind === 'lapsed') return <LapsedCard action={action} />

  if (action.kind === 'none') {
    return (
      <CardFrame>
        <Heading />
        <Title>Nothing needs you right now.</Title>
        <Detail>When you book a sacrament, the next step shows up here.</Detail>
        <Button asChild size="lg" variant="inverse" className={CTA}>
          <Link to="/services">Book a sacrament</Link>
        </Button>
      </CardFrame>
    )
  }

  const b = action.booking
  const label = SACRAMENT_LABEL[b.sacrament]
  let title: React.ReactNode
  let detail: React.ReactNode = null

  if (action.kind === 'pay') {
    title = (
      <>
        Pay for your {label} booking
        {action.deadline ? <> by {num(formatDeadline(action.deadline))}</> : null}
      </>
    )
    if (action.amountCentavos)
      detail = (
        <>
          <span className="block font-sans text-amount tabular-nums text-white">
            <span className="sr-only">Amount due </span>
            {peso(action.amountCentavos)}
            <span className="sr-only">.</span>
          </span>
          <span className="mt-1 block">Paying keeps your slot.</span>
        </>
      )
  } else if (action.kind === 'returned') {
    title = <>The parish asked for changes to your {label} booking</>
    detail = action.note ?? 'Open the booking to see what to update, then send it back.'
  } else {
    title = b.status === 'approved' ? <>Your {label} is on {when(b)}</> : <>Your {label} is waiting for approval for {when(b)}</>
    detail = b.status === 'approved' ? 'Nothing is needed from you before then.' : 'The parish will confirm it once it is approved.'
  }

  // The button comes before the rail in reading order, so it stays above the fold at large text sizes.
  return (
    <CardFrame>
      <Heading />
      <Title>{title}</Title>
      {detail && <Detail>{detail}</Detail>}
      <Button asChild size="lg" variant="inverse" className={CTA}>
        <Link to={`/booking/history/${b.id}`}>{action.cta}</Link>
      </Button>
      <JourneyRailCompact booking={b} onNavy className="mt-2" />
    </CardFrame>
  )
}
