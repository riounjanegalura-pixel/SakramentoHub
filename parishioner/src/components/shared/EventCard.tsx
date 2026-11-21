import { Calendar, MapPin } from 'lucide-react'
import type { ParishEvent } from '../../lib/types'

export function EventCard({ event }: { event: ParishEvent }) {
  const date = new Date(event.date).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
  return (
    <div className="w-64 shrink-0 overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="h-32 bg-line/40" role="img" aria-label={event.title} />
      <div className="p-3">
        <h3 className="mb-1 font-semibold">{event.title}</h3>
        <p className="flex items-center gap-1 text-sm text-ink-muted">
          <Calendar size={14} /> {date}
        </p>
        <p className="flex items-center gap-1 text-sm text-ink-muted">
          <MapPin size={14} /> {event.location}
        </p>
      </div>
    </div>
  )
}
