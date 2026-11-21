import { Search } from 'lucide-react'

/**
 * Shared search-box treatment (icon + input) for admin list screens.
 * Extracted so BookingsQueueScreen and StaffUsersScreen render the same
 * conceptual control identically — before this existed the two screens had
 * visibly different search inputs (one with the icon, one without) despite
 * being the same control in the same app. This is the canonical shape:
 * BookingsQueueScreen's markup/classes, which already had the icon.
 */
export function SearchInput({
  value,
  onChange,
  placeholder,
  label,
  className = '',
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  /** Accessible name for the input; also used for the visually-hidden label text. */
  label: string
  className?: string
}) {
  return (
    <label className={`relative flex items-center text-sm ${className}`}>
      <span className="sr-only">{label}</span>
      <Search
        size={16}
        className="pointer-events-none absolute left-3 text-ink-muted"
        aria-hidden="true"
      />
      <input
        type="search"
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-72 rounded-md border border-input-border bg-surface text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus py-1.5 pl-9 pr-2 text-sm min-h-11 lg:min-h-9"
      />
    </label>
  )
}
