import { Link } from 'react-router-dom'
import { Check, X } from 'lucide-react'
import { ResultMark } from '../../components/shared/ResultMark'
import { Button } from '../../components/ui/button'
import { useAuthStore } from '../../stores/auth-store'

/**
 * Where PayMongo sends a donor back after GCash checkout. Like the booking payment result, arriving here proves
 * nothing (anyone can type the address): the page only says thank you, and never claims the gift was recorded.
 * Public, because a donor does not need an account.
 */
export function DonateResultScreen({ outcome }: { outcome: 'thanks' | 'cancelled' }) {
  const signedIn = useAuthStore((s) => !!s.user)
  const thanks = outcome === 'thanks'

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col items-center justify-center gap-4 bg-paper p-6 text-center">
      <ResultMark tone={thanks ? 'done' : 'stop'} icon={thanks ? Check : X} />
      <h1 className="font-display text-title font-semibold text-navy">{thanks ? 'Thank you for your gift' : 'Your gift was not made'}</h1>
      <p className="text-body text-ink-muted">
        {thanks
          ? 'GCash will confirm your payment to the parish in a moment. If you paid, you will get a receipt from PayMongo by email. God bless you.'
          : 'You were not charged. You can try again whenever you like.'}
      </p>
      <Button asChild size="lg" className="w-full">
        <Link to={signedIn ? '/home' : '/login'}>{signedIn ? 'Back to Home' : 'Back to sign in'}</Link>
      </Button>
    </main>
  )
}
