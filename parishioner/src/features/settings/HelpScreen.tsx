import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import * as m from 'motion/react-m'
import { AppShell } from '../../components/shared/AppShell'
import { AppHeader } from '../../components/shared/AppHeader'
import { EmergencyCallRow } from '../../components/shared/EmergencyCallRow'
import { officeHoursText } from '../../lib/domain'
import type { ParishInfo } from '../../lib/types'
import { useParishInfo } from '../../lib/useParishInfo'

const FAQS = [
  {
    question: 'How do I book a sacrament?',
    answer:
      'Open Book, choose the sacrament you need, and fill out the booking form step by step. Once you review and confirm your details, your request is sent to the parish office.',
  },
  {
    question: 'How do I download my certificates?',
    answer:
      "Open My bookings, then Documents and certificates, to see your certificates. If a certificate is available, you'll see a button to open it. If none is shown, it hasn't been issued yet.",
  },
  {
    question: 'Who can I contact for more help?',
    answer:
      'You can reach the parish office through the following: visit us at the parish office during office hours{HOURS}{CONTACT}. You can also approach any parish staff after Mass for assistance.',
  },
  {
    question: 'How can I donate?',
    answer:
      'You can make a donation in person at the parish office during office hours{HOURS}, or hand it to any parish staff after Mass. Ask the office about current parish projects your donation can support.',
  },
]

/**
 * The answers take the office hours, number and email from the parish record, never from copy typed here.
 * With nothing on file a placeholder simply drops out, so the text never shows a wrong or empty detail.
 */
function answerText(answer: string, parish: ParishInfo | undefined): string {
  const hours = parish?.workingHours ? ` (${officeHoursText(parish)})` : ''
  const ways = [parish?.phone && `call us at ${parish.phone}`, parish?.email && `email us at ${parish.email}`].filter(Boolean)
  const contact = ways.length > 0 ? `, ${ways.join(' or ')}` : ''
  return answer.replace('{HOURS}', hours).replace('{CONTACT}', contact)
}

export function HelpScreen() {
  const navigate = useNavigate()
  const { data: parish } = useParishInfo()
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  return (
    <AppShell header={<AppHeader title="Help / FAQs" onBack={() => navigate(-1)} />}>
      <div className="mx-auto w-full max-w-prose px-4 py-6">
        <EmergencyCallRow className="mb-6" />
        <h2 className="mb-3 border-t-2 border-navy pt-3 font-display text-heading font-semibold text-navy">Frequently asked questions</h2>
        <ul className="flex flex-col gap-2">
          {FAQS.map(({ question, answer }, i) => {
            const isOpen = openIndex === i
            return (
              <li key={question} className="rounded-[14px] border border-line bg-surface">
                <h3>
                  <button
                    type="button"
                    onClick={() => setOpenIndex(isOpen ? null : i)}
                    aria-expanded={isOpen}
                    aria-controls={`faq-panel-${i}`}
                    className="flex min-h-11 w-full items-center justify-between gap-3 rounded-2xl p-4 text-left font-semibold text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                  >
                    {question}
                    <m.span
                      aria-hidden="true"
                      animate={{ rotate: isOpen ? 180 : 0 }}
                      transition={{ duration: 0.15 }}
                      className="shrink-0 text-ink-muted"
                    >
                      <ChevronDown size={18} />
                    </m.span>
                  </button>
                </h3>
                {isOpen && (
                  <p id={`faq-panel-${i}`} className="px-4 pb-4 text-body leading-relaxed text-ink [overflow-wrap:anywhere]">
                    {answerText(answer, parish)}
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </AppShell>
  )
}
