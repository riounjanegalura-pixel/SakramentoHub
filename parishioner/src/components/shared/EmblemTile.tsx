import { Link } from 'react-router-dom'
import { Emblem, type EmblemKind } from './Emblem'

/**
 * A sacrament as a tile: its emblem in the arched niche, its name in Fraunces, one quiet line under it. Two to a
 * row on a phone. The whole tile is the link.
 */
export function EmblemTile({ to, kind, name, caption, note }: { to: string; kind: EmblemKind; name: string; caption: string; note?: string }) {
  return (
    <Link
      to={to}
      data-slot="emblem-tile"
      className="flex h-full min-h-[208px] flex-col items-center gap-3 rounded-2xl border border-line bg-paper-deep px-3.5 pb-3.5 pt-4 text-center text-ink hover:border-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      <Emblem kind={kind} size="md" />
      <span className="flex flex-col items-center gap-0.5 [overflow-wrap:anywhere]">
        <span className="font-display text-[1.25rem] leading-[1.2] font-semibold text-navy">{name}</span>
        <span className="text-label text-ink-muted">{caption}</span>
        {note ? <span className="text-label text-ink-muted tabular-nums">{note}</span> : null}
      </span>
    </Link>
  )
}
