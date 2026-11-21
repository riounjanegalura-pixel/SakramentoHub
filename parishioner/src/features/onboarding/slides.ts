import type { EmblemKind } from '../../components/shared/Emblem'

export interface OnboardingSlide {
  emblem: EmblemKind
  title: string
  description: string
  imageAlt: string
}

// Content transcribed from design/Onboarding Slide 1.png through 5.png.
// design/Onboarding Slide 6.png (the "Ready to Get Started?" confirmation
// modal) was dropped per client feedback: it duplicated slide 5, so "Get
// Started" on the final slide now goes straight to /register.
export const ONBOARDING_SLIDES: OnboardingSlide[] = [
  {
    emblem: 'baptism',
    title: 'Welcome to SakramentoHub',
    description:
      'Manage sacraments and services at St. Peter the Apostle Parish easily and securely.',
    imageAlt: 'Illustration of parishioners walking toward the parish church',
  },
  {
    emblem: 'wedding',
    title: 'Book Sacraments Anytime',
    description: 'Access all parish services right from your phone anytime, anywhere.',
    imageAlt: 'Illustration of a man viewing parish services on a tablet',
  },
  {
    emblem: 'certificate',
    title: 'Simple 3-Step Booking',
    description:
      'Choose a service, fill requirements, and submit. Our streamlined process reduces confusion.',
    imageAlt:
      'Illustration of a man next to three cards labeled Choose service, Fill requirements, and Submit',
  },
  {
    emblem: 'confirmation',
    title: 'Track Your Requests',
    description: 'View booking history, check status updates, and receive notifications.',
    imageAlt:
      'Illustration of a man checking his phone next to a checklist and a notification bell',
  },
  {
    emblem: 'anointing',
    title: 'Create an Account to Start',
    description: 'Save your requests and access your records anytime, anywhere.',
    imageAlt:
      'Illustration of a woman standing beside a phone showing a secure login, with the parish church, a security shield, and a sync icon in the background',
  },
]
