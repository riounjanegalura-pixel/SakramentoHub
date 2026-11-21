import { useEffect } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AppShell } from '../../components/shared/AppShell'
import { AppHeader } from '../../components/shared/AppHeader'
import { fetchDeskBooking } from '../../lib/data/walkIns'
import { useBookingStore } from '../../stores/booking-store'
import { useDeskStore } from '../../stores/desk-store'
import { useServerErrorsStore } from '../../stores/server-errors-store'

/** Opens a returned walk-in in the desk wizard (the admin app links here). */
export function DeskEditScreen() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: booking, isError, error } = useQuery({
    queryKey: ['desk-booking', id],
    queryFn: () => fetchDeskBooking(id!),
    enabled: !!id,
  })
  const editable = !!booking && booking.channel === 'walk_in' && booking.status === 'returned'

  useEffect(() => {
    if (!booking || !editable) return
    const store = useBookingStore.getState()
    store.startBooking(booking.sacrament)
    store.updateFormData(booking.formData)
    store.setAppointment(booking.appointmentDate, booking.appointmentStart)
    store.setEditingBookingId(booking.id)
    useServerErrorsStore.getState().clear()
    // The contact the desk entered lives in walkInContact; `user` is the linked account when there is one.
    const contact = booking.walkInContact
    const email = contact?.email ?? ''
    useDeskStore.getState().load({
      draftId: booking.id,
      contact: { fullName: contact?.fullName ?? '', phone: contact?.phone ?? '', email },
      // The link was confirmed against the contact's email; the contact step drops it if that email is edited.
      linkedAccount: booking.userId ? { id: booking.userId, fullName: booking.user.fullName, email: email.trim().toLowerCase() } : null,
    })
    navigate(`/desk/${booking.sacrament}/1`, { replace: true })
  }, [booking, editable, navigate])

  return (
    <AppShell showBottomNav={false} header={<AppHeader title="Edit walk-in" onBack={() => navigate('/desk')} />}>
      <div className="p-6 text-center">
        {isError && <p role="alert" className="text-sm text-danger">Couldn&apos;t load the booking: {(error as Error).message}</p>}
        {!booking && !isError && <p className="text-sm text-ink-muted">Loading…</p>}
        {booking && !editable && (
          <>
            <p className="mb-3 font-semibold text-ink">Only a returned walk-in booking can be edited here.</p>
            <Link to="/desk" className="font-semibold text-navy">Back to the office desk</Link>
          </>
        )}
      </div>
    </AppShell>
  )
}
