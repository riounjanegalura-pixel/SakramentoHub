import { Droplets, Flame, Flower2, HandHeart, Heart, House, type LucideIcon } from 'lucide-react'
import type { Sacrament } from '../../lib/types'

const ICONS: Record<Sacrament, LucideIcon> = {
  baptism: Droplets,
  confirmation: Flame,
  wedding: Heart,
  funeral: Flower2,
  anointing: HandHeart,
  'house-blessing': House,
}

/** A plain navy outline icon beside the name, no chip. Decorative: the name is always beside it. */
export function ServiceIcon({ sacrament }: { sacrament: Sacrament }) {
  const Icon = ICONS[sacrament] ?? Droplets
  return (
    <span data-slot="service-icon" aria-hidden="true" className="flex size-6 shrink-0 items-center justify-center text-navy">
      <Icon className="size-6" aria-hidden="true" strokeWidth={1.75} />
    </span>
  )
}
