import type { ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import { useBookingStore } from '../stores/booking-store'
import { TopNav } from './TopNav'
import { Footer } from './Footer'
import { Button } from '../components/ui/button'
import { WizardProgress } from '../components/shared/StepperHeader'

type WebWizardLayoutProps = {
  title: string
  steps: Array<{ title: string }>
  /** 1-based index of the step on screen. */
  current: number
  onJump: (n: number) => void
  onBack: () => void
  children: ReactNode
}

/**
 * The desktop booking wizard: one column. The segmented progress (earlier steps jump back) sits above the current step,
 * whose fields run in a two-column grid (see `.web-wizard-card` in globals.css). There is no side panel.
 */
export function WebWizardLayout({ title, steps, current, onJump, onBack, children }: WebWizardLayoutProps) {
  const bookingId = useBookingStore((s) => s.bookingId)

  return (
    <div className="min-h-dvh bg-paper">
      <TopNav />
      <main className="mx-auto max-w-4xl px-6 py-8">
        <div data-zone="steps" className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <Button type="button" variant="ghost" size="sm" onClick={onBack} className="gap-1">
              <ArrowLeft className="size-4" aria-hidden />
              Back
            </Button>
            <p className="text-sm text-ink-muted">Step {current} of {steps.length}</p>
          </div>
          <nav aria-label="Booking steps" className="mb-6">
            <WizardProgress steps={steps.map((s) => s.title)} current={current} variant="full" onJump={onJump} />
          </nav>
          <h1 className="mb-6 font-display text-2xl font-bold text-ink">{title}</h1>
          <div className="web-wizard-card rounded-2xl border border-line bg-surface p-6">{children}</div>
          <p className="mt-4 text-label text-ink-muted">
            {bookingId ? 'Saved to your account' : 'Your answers are kept in this browser tab until you submit'}
          </p>
        </div>
      </main>
      <Footer />
    </div>
  )
}
