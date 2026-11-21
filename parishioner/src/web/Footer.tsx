import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchParishInfo } from '../lib/data/parish'
import { DonateDialog } from '../components/shared/DonateDialog'

function hours(t: string): string {
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

export function Footer() {
  const { data: parish } = useQuery({ queryKey: ['parish'], queryFn: fetchParishInfo })
  const [showDonate, setShowDonate] = useState(false)
  return (
    <footer className="border-t border-line bg-paper">
      <div className="mx-auto flex max-w-6xl flex-wrap items-start justify-between gap-6 px-6 py-8 text-sm">
        <div>
          {/* Contact details come from the parish record only; the record has no street address field, so none is shown. */}
          {parish && (
            <>
              <p className="font-display text-heading font-semibold text-navy">{parish.name}</p>
              <p className="text-ink-muted">Parish office: <a href={`tel:${parish.phone}`} className="inline-flex min-h-11 items-center font-medium text-navy underline">{parish.phone}</a></p>
              <p className="text-ink-muted">Open {hours(parish.workingHours.start)} – {hours(parish.workingHours.end)}</p>
            </>
          )}
        </div>
        <nav aria-label="Footer" className="flex flex-col gap-1">
          <Link to="/help" className="inline-flex min-h-11 items-center text-ink-muted hover:underline">Help</Link>
          <Link to="/privacy" className="inline-flex min-h-11 items-center text-ink-muted hover:underline">Privacy</Link>
          <Link to="/verify" className="inline-flex min-h-11 items-center text-ink-muted hover:underline">Verify a certificate</Link>
        </nav>
        <button
          type="button"
          onClick={() => setShowDonate(true)}
          className="min-h-11 rounded-full border border-navy px-4 py-2 font-semibold text-navy"
        >
          Support our parish
        </button>
      </div>
      <DonateDialog open={showDonate} onClose={() => setShowDonate(false)} />
    </footer>
  )
}
