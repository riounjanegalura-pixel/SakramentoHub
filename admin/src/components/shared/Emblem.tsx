import type { Sacrament } from '../../lib/types'
import { cn } from '../../lib/utils'
import anointing from '../../assets/art/anointing.svg'
import baptism from '../../assets/art/baptism.svg'
import confirmation from '../../assets/art/confirmation.svg'
import funeral from '../../assets/art/funeral.svg'
import house from '../../assets/art/house.svg'
import wedding from '../../assets/art/wedding.svg'

const SRC: Record<Sacrament, string> = { baptism, wedding, confirmation, funeral, anointing, 'house-blessing': house }

/**
 * A sacrament's drawing in an arched niche (the same emblem as the parishioner app), 44 x 50. Always decorative here:
 * the sacrament is written beside it.
 */
export function Emblem({ kind, className }: { kind: Sacrament; className?: string }) {
  return (
    <span
      data-slot="emblem"
      className={cn('grid h-[50px] w-11 shrink-0 place-items-end justify-items-center overflow-hidden rounded-t-full rounded-b-[6px] border-[1.5px] border-navy bg-surface', className)}
    >
      <img src={SRC[kind]} alt="" className="mb-px block size-[34px]" />
    </span>
  )
}
