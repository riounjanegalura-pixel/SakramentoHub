import { useNavigate } from 'react-router-dom'
import crest from '../../assets/crest.png'
import { AppShell } from '../../components/shared/AppShell'
import { AppHeader } from '../../components/shared/AppHeader'

const CAPABILITIES = [
  'Book sacraments and services online',
  'Track your booking requests',
  'Access and download your certificates',
  'Stay updated with parish events',
  'Submit requirements digitally',
  'Make donations',
]

export function AboutScreen() {
  const navigate = useNavigate()
  return (
    <AppShell header={<AppHeader title="About SakramentoHub" onBack={() => navigate(-1)} />}>
      <div className="mx-auto w-full max-w-prose px-4 py-6">
        <div className="mb-8 flex flex-col items-center text-center">
          <img src={crest} alt="Parish crest of San Pedro Apostol" className="mb-3 h-28 w-auto" />
          <h2 className="font-display text-title font-semibold text-navy">SakramentoHub</h2>
        </div>

        <section aria-labelledby="about-app" className="mb-8">
          <h2 id="about-app" className="mb-2 border-t-2 border-navy pt-3 font-display text-heading font-semibold text-navy">About the app</h2>
          <p className="text-base leading-relaxed text-ink-muted">
            SakramentoHub is your digital companion for parish sacraments and services at St.
            Peter the Apostle Parish. Stay connected with your faith community through easy
            online booking, real-time event updates, sacramental records management, and
            seamless communication with the parish office all from your phone.
          </p>
        </section>

        <section aria-labelledby="about-can-do">
          <h2 id="about-can-do" className="mb-2 border-t-2 border-navy pt-3 font-display text-heading font-semibold text-navy">What you can do</h2>
          <ul className="list-disc space-y-2 pl-5 text-base leading-relaxed text-ink-muted marker:text-navy">
            {CAPABILITIES.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      </div>
    </AppShell>
  )
}
