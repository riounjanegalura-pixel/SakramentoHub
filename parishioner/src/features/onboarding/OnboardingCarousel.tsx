import { useState } from 'react'
import { ChevronLeft } from 'lucide-react'
import { useReducedMotion } from 'motion/react'
import * as m from 'motion/react-m'
import { Navigate, useNavigate } from 'react-router-dom'
import { AppShell } from '../../components/shared/AppShell'
import crest from '../../assets/crest.png'
import { Emblem } from '../../components/shared/Emblem'
import { Button } from '../../components/ui/button'
import { useAuthStore } from '../../stores/auth-store'
import { durations, ease } from '../../lib/motion'
import { ONBOARDING_SLIDES } from './slides'

export function OnboardingCarousel() {
  const [index, setIndex] = useState(0)
  const reduceMotion = useReducedMotion()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  if (user) return <Navigate to="/home" replace />
  const slide = ONBOARDING_SLIDES[index]
  const isFirst = index === 0
  const isLast = index === ONBOARDING_SLIDES.length - 1

  function handleNext() {
    if (isLast) {
      navigate('/register')
    } else {
      setIndex((i) => i + 1)
    }
  }

  function handleBack() {
    setIndex((i) => Math.max(0, i - 1))
  }

  return (
    <AppShell showBottomNav={false}>
      <div className="flex min-h-dvh flex-col bg-paper">
        <header className="flex flex-col bg-navy px-6 pb-8 pt-6 text-white">
          <div className="flex items-center justify-between">
            <p className="font-display text-heading font-semibold">SakramentoHub</p>
            <button
              onClick={() => navigate('/login')}
              className="inline-flex min-h-11 items-center rounded-xl px-2 text-body font-semibold underline underline-offset-4"
            >
              Skip
            </button>
          </div>
          <div className="mt-6 flex justify-center">
            {isFirst ? <img src={crest} alt="Parish crest of San Pedro Apostol" className="h-[148px] w-auto" /> : <Emblem kind={slide.emblem} size="lg" />}
          </div>
        </header>
        <div className="h-[3px] bg-gold" aria-hidden="true" />
        <div className="flex flex-1 flex-col px-6 pt-8">
          <h2 className="mb-3 font-display text-display font-semibold text-navy">{slide.title}</h2>
          <p className="text-body text-ink-muted">{slide.description}</p>
          <p className="mt-8 text-label font-semibold text-ink-muted tabular-nums">{index + 1} of {ONBOARDING_SLIDES.length}</p>
        </div>
        <div className="mb-4 flex justify-center gap-2">
          {ONBOARDING_SLIDES.map((_, i) => (
            <m.span
              key={i}
              data-testid="onboarding-dot"
              initial={false}
              animate={{ width: i === index ? 24 : 8 }}
              transition={{ duration: reduceMotion ? 0 : durations.quick, ease: [...ease] }}
              className={`h-2 rounded-full ${i === index ? 'bg-navy' : 'bg-line'}`}
            />
          ))}
        </div>
        <div className="flex items-center gap-3 border-t border-line px-6 pb-8 pt-4">
          {!isFirst && (
            <Button variant="outline" size="lg" onClick={handleBack} aria-label="Previous slide" className="w-14 shrink-0 px-0">
              <ChevronLeft aria-hidden="true" />
            </Button>
          )}
          <Button size="lg" onClick={handleNext} className="flex-1">
            {isLast ? 'Get started' : 'Next'}
          </Button>
        </div>
        {isLast && (
          <p className="pb-6 text-center text-body text-ink-muted">
            Already have an account?{' '}
            <button onClick={() => navigate('/login')} className="inline-flex min-h-11 items-center font-semibold text-navy underline underline-offset-4">
              Sign in
            </button>
          </p>
        )}
      </div>
    </AppShell>
  )
}

export default OnboardingCarousel
