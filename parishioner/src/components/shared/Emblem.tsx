import { cn } from '../../lib/utils'
import type { Sacrament } from '../../lib/types'
import anointing from '../../assets/art/anointing.svg'
import baptism from '../../assets/art/baptism.svg'
import certificate from '../../assets/art/certificate.svg'
import confirmation from '../../assets/art/confirmation.svg'
import funeral from '../../assets/art/funeral.svg'
import house from '../../assets/art/house.svg'
import wedding from '../../assets/art/wedding.svg'

export type EmblemKind = Sacrament | 'certificate'

const SRC: Record<EmblemKind, string> = {
  baptism,
  wedding,
  confirmation,
  funeral,
  anointing,
  'house-blessing': house,
  certificate,
}

export type EmblemSize = 'xs' | 'sm' | 'md' | 'lg'

/** The niche and the drawing inside it, per size. Every class is written out so Tailwind can see it. */
const SIZE: Record<EmblemSize, { niche: string; img: string }> = {
  xs: { niche: 'h-[50px] w-[44px] border-[1.5px] rounded-b-[6px]', img: 'mb-px size-[34px]' },
  sm: { niche: 'h-16 w-14 border-[1.5px] rounded-b-lg', img: 'mb-0.5 size-11' },
  md: { niche: 'h-[104px] w-[92px] border-2 rounded-b-[10px]', img: 'mb-1 size-[76px]' },
  lg: { niche: 'h-[148px] w-[132px] border-2 rounded-b-[14px]', img: 'mb-1.5 size-[108px]' },
}

/**
 * A sacrament's drawing in an arched niche, the way a window frames a saint. The arch is the app's one repeated
 * shape: it stands in for the list of words a sacrament used to be. Pass `alt` only when no label sits beside it.
 */
export function Emblem({
  kind,
  size = 'md',
  alt = '',
  className,
}: {
  kind: EmblemKind
  size?: EmblemSize
  alt?: string
  className?: string
}) {
  const s = SIZE[size]
  return (
    <span
      data-slot="emblem"
      data-size={size}
      className={cn(
        'grid shrink-0 place-items-end justify-items-center overflow-hidden rounded-t-full border-navy bg-surface',
        s.niche,
        className,
      )}
    >
      <img src={SRC[kind]} alt={alt} className={cn('block', s.img)} />
    </span>
  )
}
