import { useMutation } from '@tanstack/react-query'
import { Loader2, Upload } from 'lucide-react'
import { uploadDocument } from '../../lib/data/documents'
import { attachLateDocument } from '../../lib/data/bookings'
import { cn } from '../../lib/utils'
import type { Booking, BookingDocument } from '../../lib/types'

/**
 * "Replace file" for one document the parish office sent back. The new file goes up and replaces just that document
 * on the booking; every other answer and document stays as it was, and the office is told to check it again.
 */
export function ReplaceDocument({ booking, doc, onUpdated }: { booking: Booking; doc: BookingDocument; onUpdated: (b: Booking) => void }) {
  const replace = useMutation({
    mutationFn: async (file: File) => {
      const { url } = await uploadDocument(file)
      return attachLateDocument(booking.id, doc.key, url)
    },
    onSuccess: onUpdated,
  })

  return (
    <div className="mt-2">
      <label
        className={cn(
          'inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl border border-navy px-4 text-body font-semibold text-navy focus-within:ring-2 focus-within:ring-navy',
          replace.isPending && 'opacity-60',
        )}
      >
        {replace.isPending ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Upload size={16} aria-hidden="true" />}
        <span>{replace.isPending ? 'Uploading…' : 'Replace file'}</span>
        <input
          type="file"
          accept="image/*,.pdf"
          aria-label={`Replace file: ${doc.label}`}
          disabled={replace.isPending}
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) replace.mutate(file)
          }}
        />
      </label>
      {replace.isError && (
        <p role="alert" className="mt-1 text-sm text-danger">
          {(replace.error as Error).message}
        </p>
      )}
    </div>
  )
}
