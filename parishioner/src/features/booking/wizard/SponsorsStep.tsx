import { SponsorFields } from '../../../components/fields/SponsorFields'
import { sponsorShape } from '../../../lib/validation/groups'
import type { FormValues } from '../../../lib/validation/groups'
import type { z } from 'zod'
import { StepFrame } from './StepFrame'
import { useStepForm } from './useStepForm'
import { rows } from './review'
import type { WizardStep } from './types'

interface SponsorRules {
  min: number
  max: number
  minAge: number
  /** 'principal' = only sponsors[0] must be a Roman Catholic aged 16+ (baptism); 'all' = every sponsor (confirmation). */
  eligibility: 'principal' | 'all' | 'none'
  title: string
  hint: string
  /** Review label for each entry ("Sponsor 1", "Godparent 1"); the fields themselves never change. */
  noun?: string
  extraRefine?: (d: FormValues, ctx: z.RefinementCtx) => void
}

type Sponsor = {
  role?: string
  firstName?: string
  middleName?: string
  lastName?: string
  age?: number
  religion?: string
  residence?: string
  residenceLine?: string
}

const ROLE_LABEL: Record<string, string> = { ninong: 'Ninong (godfather)', ninang: 'Ninang (godmother)' }

/** The one sponsor step every sacrament uses, so a sponsor is asked for and shown the same way everywhere. */
export function sponsorsStep(rules: SponsorRules): WizardStep {
  const noun = rules.noun ?? 'Sponsor'
  return {
    id: 'sponsors',
    title: rules.title,
    shape: sponsorShape(rules.min, rules.max, rules.minAge),
    refine: (d, ctx) => {
      const sponsors = (Array.isArray(d.sponsors) ? d.sponsors : []) as Sponsor[]
      const checked = rules.eligibility === 'all' ? sponsors : rules.eligibility === 'principal' ? sponsors.slice(0, 1) : []
      checked.forEach((s, i) => {
        // A missing value is already reported by the shape; only judge values that are present.
        if (typeof s.age === 'number' && s.age < 16) ctx.addIssue({ code: 'custom', path: ['sponsors', i, 'age'], message: 'Must be at least 16 years old' })
        if (typeof s.religion === 'string' && s.religion !== 'Roman Catholic') ctx.addIssue({ code: 'custom', path: ['sponsors', i, 'religion'], message: 'Must be Roman Catholic' })
      })
      rules.extraRefine?.(d, ctx)
    },
    Component: function SponsorsView({ step }) {
      const { form, onContinue } = useStepForm(step)
      return (
        <StepFrame onContinue={onContinue}>
          <h2 className="mb-2 border-t-2 border-navy pt-3 font-display text-[1.375rem] leading-[1.3] font-semibold text-ink">{rules.title}</h2>
          <SponsorFields form={form} min={rules.min} max={rules.max} minAge={rules.minAge} hint={rules.hint} />
        </StepFrame>
      )
    },
    review: (d) =>
      ((Array.isArray(d.sponsors) ? d.sponsors : []) as Sponsor[]).flatMap((s, i) => {
        const n = `${noun} ${i + 1}`
        return rows([
          [`${n}`, [s.firstName, s.middleName, s.lastName].filter((p) => typeof p === 'string' && p.trim() !== '').join(' ')],
          [`${n} role`, s.role ? ROLE_LABEL[s.role] ?? s.role : undefined],
          [`${n} age`, s.age],
          [`${n} religion`, s.religion],
          [`${n} residence`, [s.residenceLine, s.residence].filter((p) => typeof p === 'string' && p.trim() !== '').join(', ')],
        ])
      }),
  }
}
