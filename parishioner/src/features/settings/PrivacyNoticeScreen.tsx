import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Check, ChevronDown } from 'lucide-react'
import { AppShell } from '../../components/shared/AppShell'
import { AppHeader } from '../../components/shared/AppHeader'

const LINK = 'font-semibold text-navy underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus'

/** The short version: what a parishioner most needs to know before opening any section. */
const QUICK_FACTS = [
  'We collect only what a booking needs.',
  'We never sell your data or use it for marketing.',
  'You can see, correct, export or delete your data from Settings.',
  'Emails are about your own bookings only.',
]

/** One section of the notice: a heading you can open, so the page starts short and the detail is one tap away. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="group border-t border-line first:border-t-0">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus [&::-webkit-details-marker]:hidden">
        <h2 className="font-display text-heading font-semibold text-navy">{title}</h2>
        <ChevronDown size={20} aria-hidden="true" className="shrink-0 text-ink-muted group-open:rotate-180" />
      </summary>
      <div className="pb-4 text-ink-muted">{children}</div>
    </details>
  )
}

/** The notice itself, without a page around it, so the sign-up form can show it in a panel without leaving. */
export function PrivacyNoticeBody() {
  return (
    <>
      <p className="text-ink-muted">
        St. Peter the Apostle Parish (Balagtas, Bulacan) collects and processes your personal
        data in accordance with the Data Privacy Act of 2012 (Republic Act No. 10173).
      </p>

      <div className="rounded-2xl border border-line bg-paper-deep p-4">
        <p className="font-display text-heading font-semibold text-navy">The short version</p>
        <ul className="mt-2 flex flex-col gap-1.5 text-ink">
          {QUICK_FACTS.map((fact) => (
            <li key={fact} className="flex gap-2.5">
              <Check size={18} aria-hidden="true" className="mt-1 shrink-0 text-navy" />
              <span>{fact}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-2xl border border-line bg-surface px-4">
        <Section title="What we collect">
          <p>
            Your full name, contact number, email address, and the sacrament-specific details you
            provide when booking (e.g. birth/marriage details, sponsor names, addresses), plus any
            document or GCash receipt you upload as part of a booking.
          </p>
        </Section>
        <Section title="Why we collect it">
          <p>
            Solely to process and maintain your sacrament booking and the parish's sacramental
            records — the purpose every field in this app exists for. We do not sell or share your
            data with third parties for marketing.
          </p>
        </Section>
        <Section title="How long we keep it">
          <p>
            Sacramental records are retained indefinitely, consistent with the parish's
            record-keeping obligations as a civil registry of sacraments. Account and booking data
            you haven't completed a sacrament for (e.g. a cancelled booking) is retained only as
            long as needed to administer your account.
          </p>
        </Section>
        <Section title="Your rights">
          <p>
            Under RA 10173 you may access, correct, export, or delete your personal data, subject
            to the parish's legitimate record-keeping obligations for completed sacraments. You can
            correct your details anytime from{' '}
            <Link to="/settings/profile" className={LINK}>Profile Info</Link>
            , and access or delete your account directly from{' '}
            <Link to="/settings" className={LINK}>Settings</Link>{' '}
            — "Export My Data" downloads a full copy of your account and booking data, and "Delete
            My Account" permanently deletes your personal information (your booking history is
            retained without your personal details, for the parish's own sacramental
            recordkeeping). If you'd rather have parish staff handle a request on your behalf, see
            the Help screen for contact details.
          </p>
        </Section>
        <Section title="Your document wallet">
          <p>
            If you add a document to your wallet (for example a birth or baptismal certificate), we
            keep the file and the name you give for it so you can reuse it in later bookings. Only
            you can open it. The parish office can open it only when you attach it to a booking.
            You can delete a document from your wallet at any time; a copy already attached to a
            booking stays with that booking.
          </p>
        </Section>
        <Section title="Emails about your requests and reminders">
          <p>
            We use your email address to tell you when a booking or a certificate request changes
            and to send reminders about an upcoming sacrament. These emails are about your own
            bookings and requests only, never marketing.
          </p>
        </Section>
        <Section title="Requests for certificate copies">
          <p>
            When you ask for a copy of a certificate, we ask for a photo of your ID, and a letter if
            you are asking for someone else, only so the parish office can check who is asking. The
            photo and letter are deleted 30 days after your request is closed.
          </p>
        </Section>
        <Section title="Security">
          <p>
            Your password is hashed, never stored in plain text. Uploaded receipts and prerequisite
            documents are stored on access-controlled storage — only you and authorized parish
            staff can view them, not the public.
          </p>
        </Section>
      </div>
    </>
  )
}

/**
 * The actual, demonstrable answer to the paper's NFR:001 (RA 10173 Data
 * Privacy Act compliance) claim — previously asserted with zero content
 * anywhere in the app. Reachable both pre-login (from the registration
 * wizard's required consent checkbox) and from Settings afterward, so it's
 * not a one-time gate a parishioner can never see again.
 */
export function PrivacyNoticeScreen() {
  const navigate = useNavigate()
  return (
    <AppShell header={<AppHeader title="Privacy Notice" onBack={() => navigate(-1)} />}>
      <div className="mx-auto flex w-full max-w-prose flex-col gap-6 px-4 py-6 text-base leading-relaxed text-ink">
        <PrivacyNoticeBody />
      </div>
    </AppShell>
  )
}
