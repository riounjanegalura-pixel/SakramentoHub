import { useMutation } from '@tanstack/react-query'
import { useAuthStore } from '../../stores/auth-store'
import { resendVerificationEmail } from '../../lib/data/auth'

/**
 * Real, wired-up notice for an unverified parishioner — not decorative.
 * Backs the actual gate on `PATCH /bookings/:id/submit` (see
 * BookingController::submit and docs/api-contract.md's "Email verification
 * gate" section): a booking can be drafted while unverified, but not
 * finally submitted, so this stays visible until the account is verified.
 */
export function EmailVerificationBanner() {
  const user = useAuthStore((s) => s.user)

  const mutation = useMutation({
    mutationFn: resendVerificationEmail,
  })

  if (!user || user.emailVerifiedAt) return null

  return (
    <div className="mx-4 mt-3 rounded-xl bg-status-pending-bg px-4 py-3 text-body text-ink">
      <p className="font-semibold">Please verify your email address</p>
      <p className="mt-1 text-ink">
        You can browse freely, but you&apos;ll need to verify your email before submitting a booking.
      </p>
      {mutation.isSuccess ? (
        <p className="mt-2 text-navy">Verification email sent. Check your inbox, and your spam folder if it is not there.</p>
      ) : (
        <button
          type="button"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          className="mt-2 font-semibold text-navy underline disabled:opacity-60 min-h-11"
        >
          {mutation.isPending ? 'Sending…' : 'Resend verification email'}
        </button>
      )}
      {mutation.isError && (
        <p className="mt-2 text-danger">{(mutation.error as Error).message}</p>
      )}
    </div>
  )
}
