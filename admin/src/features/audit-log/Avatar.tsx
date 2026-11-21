const TINTS = ['bg-status-confirmed-bg', 'bg-status-pending-bg', 'bg-status-done-bg', 'bg-paper-deep', 'bg-status-rejected-bg']

export const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w) && !/^(fr|rev|msgr)\.?$/i.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || '?'

/** A round initials badge. The tint is picked from the name, so one person always has the same colour. */
export function Avatar({ name: rawName, size = 36 }: { name: string | null; size?: 30 | 36 | 40 }) {
  const name = rawName ?? 'System'
  const tint = TINTS[[...name].reduce((n, c) => n + c.charCodeAt(0), 0) % TINTS.length]
  const dim = size === 40 ? 'size-10 text-[14px]' : size === 36 ? 'size-9 text-[13px]' : 'size-[30px] text-[12px]'
  return (
    <span aria-hidden="true" className={`flex shrink-0 items-center justify-center rounded-full font-semibold text-navy ${dim} ${tint}`}>
      {initialsOf(name)}
    </span>
  )
}
