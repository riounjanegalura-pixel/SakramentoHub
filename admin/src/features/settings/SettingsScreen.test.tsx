import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SettingsScreen } from './SettingsScreen'
import * as settingsData from '../../lib/data/settings'
import * as notificationsData from '../../lib/data/notifications'
import { useAuthStore } from '../../stores/auth-store'
import { LocationProbe, renderWithProviders } from '../../test/render'
import { expectNoA11yViolations } from '../../test/a11y'
import type { AdminService, AdminSettings, Blackout, Role } from '../../lib/types'

const service = (o: Partial<AdminService> = {}): AdminService => ({
  id: 'funeral', name: 'Funeral Mass', description: null, feeRule: 'none', priceCentavos: null, durationMinutes: 60, offsite: false,
  allowedWeekdays: [1, 2, 3, 4, 5, 6], leadTimeDays: 1, dailyCapacity: null, hasSessions: false,
  sessionWeekdays: null, sessionTimes: null, sessionCapacity: null, sessionDurationMinutes: null, sponsorFeeAllowed: false, ...o,
})

const settings = (): AdminSettings => ({
  parish: { parishName: 'St. Peter the Apostle Parish', parishAddress: 'Balagtas, Bulacan', priestName: 'Rev. Fr. Leopoldo S. Evangelista', parishPhone: '09123456789', workingHoursStart: '08:00', workingHoursEnd: '17:00', lunchStart: '12:00', lunchEnd: '13:00', slotStepMinutes: 30, travelBufferMinutes: 30, priestTitle: 'Parish Priest', priestSignature: null },
  services: [
    service(),
    service({ id: 'baptism', name: 'Baptism', feeRule: 'per_sponsor', priceCentavos: 5000, leadTimeDays: 7, allowedWeekdays: [2, 3, 4, 5, 6], hasSessions: true, sessionWeekdays: [7], sessionTimes: ['10:00'], sessionCapacity: 10, sessionDurationMinutes: 60, sponsorFeeAllowed: true }),
  ],
  policy: { paymentHoldHours: 48, returnedHoldDays: 7, changeCutoffDays: 3 },
  triduum: [{ date: '2027-03-25', reason: 'Holy Thursday' }, { date: '2027-03-26', reason: 'Good Friday' }],
})

const blackout = (o: Partial<Blackout> = {}): Blackout => ({ id: 7, date: '2026-11-10', reason: 'Retreat', sacraments: null, ...o })

const signIn = (role: Role) =>
  useAuthStore.setState({ user: { id: 'u1', fullName: 'Someone', email: 's@example.com', phone: '', address: '', role, isActive: true } })


/** Service cards are closed to a one-line summary; open one by its name and return it. */
async function openCard(name: string) {
  const region = await screen.findByRole('region', { name: `${name} settings` })
  const toggle = within(region).getByRole('button', { name: new RegExp(`^${name}`) })
  if (toggle.getAttribute('aria-expanded') !== 'true') await userEvent.click(toggle)
  return within(region)
}

// "Name" is also a service field, so the priest's is found inside its own group.
const findPriestName = async () => within(await screen.findByRole('group', { name: 'Priest' })).getByLabelText('Name')
const getPriestName = () => within(screen.getByRole('group', { name: 'Priest' })).getByLabelText('Name')

describe('SettingsScreen', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(notificationsData, 'fetchNotifications').mockResolvedValue([])
    vi.spyOn(settingsData, 'fetchSettings').mockResolvedValue(settings())
    vi.spyOn(settingsData, 'fetchBlackouts').mockResolvedValue([blackout()])
  })
  afterEach(() => useAuthStore.setState({ user: null }))

  it('lets staff read everything but change only blackout dates', async () => {
    signIn('staff')
    renderWithProviders(<SettingsScreen />)

    expect(await findPriestName()).toBeDisabled()
    expect(getPriestName()).toHaveValue('Rev. Fr. Leopoldo S. Evangelista')
    expect(screen.getAllByText('Only an administrator can change this page. You can read it.').length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: 'Save parish settings' })).not.toBeInTheDocument()
    await userEvent.click(await screen.findByRole('tab', { name: 'Services' }))
    expect(screen.queryByRole('button', { name: 'Save Baptism' })).not.toBeInTheDocument()
    expect((await openCard('Baptism')).getByLabelText('Book ahead (days)')).toBeDisabled()
    await userEvent.click(await screen.findByRole('tab', { name: 'Blackout dates' }))
    fireEvent.change(screen.getByLabelText(/^From/), { target: { value: '2026-11-12' } })
    await userEvent.type(screen.getByLabelText(/^Reason/), 'Parish fiesta')
    expect(screen.getByRole('button', { name: 'Add closure' })).toBeEnabled()
  })

  it('keeps unsaved edits when switching tabs and back', async () => {
    signIn('admin')
    renderWithProviders(<SettingsScreen />)
    const priest = await findPriestName()
    await userEvent.clear(priest)
    await userEvent.type(priest, 'Rev. Fr. Unsaved')
    await userEvent.click(screen.getByRole('tab', { name: 'Services' }))
    await userEvent.click(screen.getByRole('tab', { name: 'Parish' }))
    expect(getPriestName()).toHaveValue('Rev. Fr. Unsaved')
  })

  it('shows the parish address, read-only for staff', async () => {
    signIn('staff')
    renderWithProviders(<SettingsScreen />)
    expect(await screen.findByLabelText('Address')).toHaveValue('Balagtas, Bulacan')
    expect(screen.getByLabelText('Address')).toBeDisabled()
  })

  it('lets an admin change the parish address, which is sent as parishAddress', async () => {
    signIn('admin')
    const update = vi.spyOn(settingsData, 'updateParishSettings').mockResolvedValue(settings().parish)
    renderWithProviders(<SettingsScreen />)
    const address = await screen.findByLabelText('Address')
    expect(address).toBeEnabled()
    await userEvent.clear(address)
    await userEvent.type(address, 'Poblacion, Balagtas, Bulacan')
    await userEvent.click(screen.getByRole('button', { name: 'Save parish settings' }))
    await waitFor(() => expect(update).toHaveBeenCalledWith({ parishAddress: 'Poblacion, Balagtas, Bulacan' }))
  })

  it('shows the fixed policy windows and the Easter Triduum as read-only text', async () => {
    signIn('staff')
    renderWithProviders(<SettingsScreen />)
    await userEvent.click(await screen.findByRole('tab', { name: 'Policy' }))
    const policy = await screen.findByRole('region', { name: 'Policy' })
    expect(policy).toHaveTextContent('48 hours')
    expect(policy).toHaveTextContent('7 days')
    expect(policy).toHaveTextContent('3 days')
    await userEvent.click(await screen.findByRole('tab', { name: 'Blackout dates' }))
    const triduum = screen.getByRole('region', { name: 'Easter Triduum' })
    expect(triduum).toHaveTextContent('Holy Thursday')
    expect(triduum).toHaveTextContent('Good Friday')
  })

  it('lets an admin save parish settings, sending only what changed', async () => {
    signIn('admin')
    const update = vi.spyOn(settingsData, 'updateParishSettings').mockResolvedValue(settings().parish)
    renderWithProviders(<SettingsScreen />)

    const save = await screen.findByRole('button', { name: 'Save parish settings' })
    expect(save).toBeDisabled()
    const priest = getPriestName()
    await userEvent.clear(priest)
    await userEvent.type(priest, 'Rev. Fr. New Priest')
    await userEvent.click(within(screen.getByRole('radiogroup', { name: 'Slot step' })).getByRole('radio', { name: '60 min' }))
    await userEvent.click(save)

    await waitFor(() => expect(update).toHaveBeenCalledWith({ priestName: 'Rev. Fr. New Priest', slotStepMinutes: 60 }))
    expect(await screen.findByRole('status')).toHaveTextContent('Parish details saved.')
  })

  it('lets an admin change the title printed under the priest name', async () => {
    signIn('admin')
    const update = vi.spyOn(settingsData, 'updateParishSettings').mockResolvedValue(settings().parish)
    renderWithProviders(<SettingsScreen />)
    const title = await screen.findByLabelText('Title')
    expect(title).toHaveValue('Parish Priest')
    await userEvent.clear(title)
    await userEvent.type(title, 'Rector')
    await userEvent.click(screen.getByRole('button', { name: 'Save parish settings' }))
    await waitFor(() => expect(update).toHaveBeenCalledWith({ priestTitle: 'Rector' }))
  })

  it('lets an admin upload a PNG or JPEG signature, previews it and sends it as a data URL', async () => {
    signIn('admin')
    const update = vi.spyOn(settingsData, 'updateParishSettings').mockResolvedValue(settings().parish)
    renderWithProviders(<SettingsScreen />)
    expect(await screen.findByText('No signature image yet.')).toBeInTheDocument()

    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'signature.png', { type: 'image/png' })
    await userEvent.upload(screen.getByLabelText('Signature'), file)
    expect(await screen.findByRole('img', { name: 'Signature preview' })).toHaveAttribute('src', 'data:image/png;base64,iVBORw==')
    await userEvent.click(screen.getByRole('button', { name: 'Save parish settings' }))
    await waitFor(() => expect(update).toHaveBeenCalledWith({ priestSignature: 'data:image/png;base64,iVBORw==' }))
  })

  it('refuses a signature that is not PNG or JPEG, or is over 200 KB, without changing anything', async () => {
    signIn('admin')
    renderWithProviders(<SettingsScreen />)
    const input = await screen.findByLabelText('Signature')

    await userEvent.upload(input, new File(['<svg/>'], 'signature.svg', { type: 'image/svg+xml' }), { applyAccept: false })
    expect(await screen.findByText('Choose a PNG or JPEG image.')).toBeInTheDocument()
    expect(input).toHaveAttribute('aria-invalid', 'true')

    await userEvent.upload(input, new File([new Uint8Array(200 * 1024 + 1)], 'big.png', { type: 'image/png' }))
    expect(await screen.findByText('The image is over 200 KB. Choose a smaller file.')).toBeInTheDocument()

    expect(screen.queryByRole('img', { name: 'Signature preview' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save parish settings' })).toBeDisabled()
  })

  it('lets an admin remove the signature, which is sent as null', async () => {
    signIn('admin')
    const withSignature = settings()
    withSignature.parish.priestSignature = 'data:image/png;base64,iVBORw=='
    vi.spyOn(settingsData, 'fetchSettings').mockResolvedValue(withSignature)
    const update = vi.spyOn(settingsData, 'updateParishSettings').mockResolvedValue(withSignature.parish)
    renderWithProviders(<SettingsScreen />)

    expect(await screen.findByRole('img', { name: 'Signature preview' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(screen.queryByRole('img', { name: 'Signature preview' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Save parish settings' }))
    await waitFor(() => expect(update).toHaveBeenCalledWith({ priestSignature: null }))
  })

  it('removing the signature also clears an earlier error about a refused file', async () => {
    signIn('admin')
    const withSignature = settings()
    withSignature.parish.priestSignature = 'data:image/png;base64,iVBORw=='
    vi.spyOn(settingsData, 'fetchSettings').mockResolvedValue(withSignature)
    renderWithProviders(<SettingsScreen />)

    const input = await screen.findByLabelText('Signature')
    await userEvent.upload(input, new File(['<svg/>'], 'signature.svg', { type: 'image/svg+xml' }), { applyAccept: false })
    expect(await screen.findByText('Choose a PNG or JPEG image.')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(screen.queryByText('Choose a PNG or JPEG image.')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Signature')).not.toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('No signature image yet.')).toBeInTheDocument()
  })

  it('shows staff the title and signature without letting them change either', async () => {
    signIn('staff')
    const withSignature = settings()
    withSignature.parish.priestSignature = 'data:image/png;base64,iVBORw=='
    vi.spyOn(settingsData, 'fetchSettings').mockResolvedValue(withSignature)
    renderWithProviders(<SettingsScreen />)

    expect(await screen.findByLabelText('Title')).toBeDisabled()
    expect(screen.getByLabelText('Signature')).toBeDisabled()
    expect(screen.getByRole('img', { name: 'Signature preview' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument()
  })

  it('shows the server message when parish settings are refused', async () => {
    signIn('admin')
    vi.spyOn(settingsData, 'updateParishSettings').mockRejectedValue(new Error('Working hours must end after they start.'))
    renderWithProviders(<SettingsScreen />)
    fireEvent.change(await screen.findByLabelText('Closes'), { target: { value: '07:00' } })
    await userEvent.click(screen.getByRole('button', { name: 'Save parish settings' }))
    expect(await screen.findByText('Working hours must end after they start.')).toBeInTheDocument()
  })

  it('lets an admin edit one service and sends only its changed keys', async () => {
    signIn('admin')
    const update = vi.spyOn(settingsData, 'updateServiceSettings').mockResolvedValue(settings().services[1])
    const { client } = renderWithProviders(<SettingsScreen />)
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    await userEvent.click(await screen.findByRole('tab', { name: 'Services' }))
    const card = await openCard('Baptism')
    const lead = card.getByLabelText('Book ahead (days)')
    await userEvent.clear(lead)
    await userEvent.type(lead, '3')
    await userEvent.click(within(card.getByRole('group', { name: 'Days it can be booked' })).getByLabelText('Sat')) // remove Saturday
    await userEvent.click(card.getByRole('button', { name: 'Save Baptism' }))

    await waitFor(() => {
      expect(update).toHaveBeenCalledWith('baptism', { leadTimeDays: 3, allowedWeekdays: [2, 3, 4, 5] })
      expect(invalidate).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['admin-schedule'] }))
    })
  })

  it('offers "Per sponsor" only where sponsors exist and asks for a price with a fee', async () => {
    signIn('admin')
    const update = vi.spyOn(settingsData, 'updateServiceSettings').mockResolvedValue(settings().services[0])
    renderWithProviders(<SettingsScreen />)

    await userEvent.click(await screen.findByRole('tab', { name: 'Services' }))
    const baptism = await openCard('Baptism')
    expect(within(baptism.getByRole('radiogroup', { name: 'Fee' })).getByRole('radio', { name: 'Per sponsor' })).toBeInTheDocument()
    expect(baptism.getByLabelText('Price ₱')).toHaveValue('50.00')

    const funeral = await openCard('Funeral Mass')
    expect(within(funeral.getByRole('radiogroup', { name: 'Fee' })).queryByRole('radio', { name: 'Per sponsor' })).not.toBeInTheDocument()
    expect(funeral.queryByLabelText(/^Price/)).not.toBeInTheDocument() // no fee, no price box
    await userEvent.click(within(funeral.getByRole('radiogroup', { name: 'Fee' })).getByRole('radio', { name: 'Flat fee' }))
    await userEvent.type(funeral.getByLabelText('Price ₱'), '1000')
    await userEvent.click(funeral.getByRole('button', { name: 'Save Funeral Mass' }))

    await waitFor(() => expect(update).toHaveBeenCalledWith('funeral', { feeRule: 'flat', priceCentavos: 100000 }))
  })

  it('shows session fields only for a service that has sessions', async () => {
    signIn('admin')
    renderWithProviders(<SettingsScreen />)
    await userEvent.click(await screen.findByRole('tab', { name: 'Services' }))
    const baptism = await openCard('Baptism')
    expect(baptism.getByText('Start times')).toBeInTheDocument()
    expect(baptism.getByText('10:00 AM')).toBeInTheDocument()
    expect(baptism.getByRole('button', { name: '+ Add a time' })).toBeInTheDocument()
    const funeral = await openCard('Funeral Mass')
    expect(funeral.queryByText('Start times')).not.toBeInTheDocument()
  })

  it('adds a closure for staff and lists the bookings it lands on', async () => {
    signIn('staff')
    const create = vi.spyOn(settingsData, 'createBlackouts').mockResolvedValue({
      blackouts: [blackout({ id: 8, date: '2026-11-12', reason: 'Parish fiesta' })],
      affectedBookings: [{ id: 'b1', referenceNumber: 'FUNE-1', sacrament: 'funeral', subjectName: 'Pedro Lim', appointmentDate: '2026-11-12', appointmentStart: '10:00' }],
    })
    renderWithProviders(<SettingsScreen />)

    await userEvent.click(await screen.findByRole('tab', { name: 'Blackout dates' }))
    fireEvent.change(await screen.findByLabelText(/^From/), { target: { value: '2026-11-12' } })
    await userEvent.type(screen.getByLabelText(/^Reason/), 'Parish fiesta')
    await userEvent.click(screen.getByRole('button', { name: 'Add closure' }))

    await waitFor(() => expect(create).toHaveBeenCalledWith({ date: '2026-11-12', reason: 'Parish fiesta', sacraments: null }))
    const alert = await screen.findByRole('status')
    expect(alert).toHaveTextContent('1 booking already falls on these dates')
    expect(alert).toHaveTextContent('They keep their slot. Reschedule them or call.')
    expect(within(alert).getByRole('link', { name: /FUNE-1 · Pedro Lim/ })).toHaveAttribute('href', '/bookings/b1')
  })

  it('sends a date range and the chosen services', async () => {
    signIn('admin')
    const create = vi.spyOn(settingsData, 'createBlackouts').mockResolvedValue({ blackouts: [], affectedBookings: [] })
    renderWithProviders(<SettingsScreen />)

    await userEvent.click(await screen.findByRole('tab', { name: 'Blackout dates' }))
    fireEvent.change(await screen.findByLabelText(/^From/), { target: { value: '2026-11-12' } })
    fireEvent.change(screen.getByLabelText(/^Until/), { target: { value: '2026-11-14' } })
    await userEvent.type(screen.getByLabelText(/^Reason/), 'Retreat')
    await userEvent.click(within(screen.getByRole('group', { name: 'Applies to' })).getByLabelText('Baptism'))
    await userEvent.click(screen.getByRole('button', { name: 'Add closure' }))

    await waitFor(() => expect(create).toHaveBeenCalledWith({ date: '2026-11-12', endDate: '2026-11-14', reason: 'Retreat', sacraments: ['baptism'] }))
    expect(await screen.findByText('Closure added.')).toBeInTheDocument()
  })

  it('lists upcoming closures and deletes one after confirmation', async () => {
    signIn('staff')
    const remove = vi.spyOn(settingsData, 'deleteBlackout').mockResolvedValue(undefined)
    renderWithProviders(<SettingsScreen />)

    await userEvent.click(await screen.findByRole('tab', { name: 'Blackout dates' }))
    const list = await screen.findByRole('list', { name: 'Upcoming closures' })
    expect(list).toHaveTextContent('Retreat')
    expect(list).toHaveTextContent('All services')
    await userEvent.click(within(list).getByRole('button', { name: 'Delete closure Retreat' }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Remove closure' }))
    await waitFor(() => expect(remove).toHaveBeenCalledWith(7))
  })

  it('shows the server refusal inside the delete dialog', async () => {
    signIn('staff')
    vi.spyOn(settingsData, 'deleteBlackout').mockRejectedValue(new Error('Closure is locked'))
    renderWithProviders(<SettingsScreen />, { route: '/settings?tab=blackouts' })
    await userEvent.click(await screen.findByRole('button', { name: 'Delete closure Retreat' }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Remove closure' }))
    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent('Closure is locked')
  })

  it('does not delete when the confirmation is declined', async () => {
    signIn('staff')
    const remove = vi.spyOn(settingsData, 'deleteBlackout').mockResolvedValue(undefined)
    renderWithProviders(<SettingsScreen />)
    await userEvent.click(await screen.findByRole('tab', { name: 'Blackout dates' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Delete closure Retreat' }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Keep closure' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(remove).not.toHaveBeenCalled()
  })

  it('has a Settings link in the sidebar for staff', async () => {
    signIn('staff')
    renderWithProviders(<SettingsScreen />)
    expect(await screen.findByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings')
  })

  it('shows the Parish tab first and falls back to it for an unknown ?tab', async () => {
    signIn('staff')
    renderWithProviders(<SettingsScreen />, { route: '/settings?tab=nonsense' })
    expect(await screen.findByRole('tab', { name: 'Parish', selected: true })).toBeInTheDocument()
    expect(await findPriestName()).toBeInTheDocument()
  })

  it('keeps the chosen tab in the address', async () => {
    signIn('staff')
    renderWithProviders(<><SettingsScreen /><LocationProbe /></>, { route: '/settings' })
    await userEvent.click(await screen.findByRole('tab', { name: 'Blackout dates' }))
    expect(screen.getByTestId('location')).toHaveTextContent('tab=blackouts')
    expect(screen.getByRole('tab', { name: 'Blackout dates', selected: true })).toBeInTheDocument()
  })

  it('opens the tab named in the address', async () => {
    signIn('staff')
    renderWithProviders(<SettingsScreen />, { route: '/settings?tab=services' })
    expect(await screen.findByRole('tab', { name: 'Services', selected: true })).toBeInTheDocument()
    expect(await screen.findByRole('region', { name: 'Baptism settings' })).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    signIn('admin')
    const { container } = renderWithProviders(<SettingsScreen />)
    await findPriestName()
    await expectNoA11yViolations(container, { fullPage: true })
  })

  it('is a real tablist that moves with the arrow keys and keeps ?tab=', async () => {
    signIn('admin')
    renderWithProviders(<><SettingsScreen /><LocationProbe /></>, { route: '/settings' })
    const parish = await screen.findByRole('tab', { name: 'Parish' })
    expect(screen.getByRole('tablist')).toBeInTheDocument()
    expect(screen.getAllByRole('tab')).toHaveLength(4)
    parish.focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(await screen.findByRole('tab', { name: 'Services', selected: true })).toHaveFocus()
    expect(screen.getByTestId('location')).toHaveTextContent('tab=services')
    await userEvent.keyboard('{ArrowRight}')
    expect(await screen.findByRole('tab', { name: 'Policy', selected: true })).toBeInTheDocument()
  })

  it('names what was saved for a service and warns about unsaved edits', async () => {
    signIn('admin')
    vi.spyOn(settingsData, 'updateServiceSettings').mockResolvedValue(settings().services[1])
    renderWithProviders(<SettingsScreen />, { route: '/settings?tab=services' })
    const card = await openCard('Baptism')
    expect(card.queryByText(/unsaved changes/i)).not.toBeInTheDocument()
    const lead = card.getByLabelText('Book ahead (days)')
    await userEvent.clear(lead)
    await userEvent.type(lead, '3')
    expect(card.getByText(/unsaved changes/i)).toBeInTheDocument()
    await userEvent.click(card.getByRole('button', { name: 'Save Baptism' }))
    expect(await within(screen.getByRole('region', { name: 'Baptism settings' })).findByRole('status')).toHaveTextContent('Baptism saved.')
  })

  it('warns in text about unsaved parish edits', async () => {
    signIn('admin')
    renderWithProviders(<SettingsScreen />)
    const phone = await screen.findByLabelText('Phone')
    expect(screen.queryByText(/unsaved changes/i)).not.toBeInTheDocument()
    await userEvent.type(phone, '1')
    expect(screen.getByText(/unsaved changes/i)).toBeInTheDocument()
  })

  it('shows a refused save as an alert and moves focus to it', async () => {
    signIn('admin')
    vi.spyOn(settingsData, 'updateParishSettings').mockRejectedValue(new Error('Working hours must end after they start.'))
    renderWithProviders(<SettingsScreen />)
    fireEvent.change(await screen.findByLabelText('Closes'), { target: { value: '07:00' } })
    await userEvent.click(screen.getByRole('button', { name: 'Save parish settings' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Working hours must end after they start.')
    await waitFor(() => expect(alert).toHaveFocus())
  })

  it('marks the closure fields Required in words and links their hints', async () => {
    signIn('staff')
    renderWithProviders(<SettingsScreen />, { route: '/settings?tab=blackouts' })
    const from = await screen.findByLabelText(/^From/)
    expect(from).toBeRequired()
    expect(screen.getAllByText('Required').length).toBeGreaterThanOrEqual(2)
    const until = screen.getByLabelText(/^Until/)
    expect(until.getAttribute('aria-describedby')).toMatch(/blackout-until-description/)
    expect(screen.getByLabelText(/^Reason/)).toBeRequired()
  })

  it('says a closure was removed', async () => {
    signIn('staff')
    vi.spyOn(settingsData, 'deleteBlackout').mockResolvedValue(undefined)
    renderWithProviders(<SettingsScreen />, { route: '/settings?tab=blackouts' })
    await userEvent.click(await screen.findByRole('button', { name: 'Delete closure Retreat' }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Remove closure' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Closure removed.')
  })

  it('shows a busy skeleton with a screen-reader label while loading', async () => {
    signIn('admin')
    vi.spyOn(settingsData, 'fetchSettings').mockReturnValue(new Promise(() => {}))
    renderWithProviders(<SettingsScreen />)
    const label = await screen.findByText('Loading settings')
    expect(label).toHaveClass('sr-only')
    expect(label.closest('[aria-busy="true"]')).not.toBeNull()
  })

  it('offers a retry when settings cannot be loaded', async () => {
    signIn('admin')
    const spy = vi.spyOn(settingsData, 'fetchSettings').mockRejectedValueOnce(new Error('Server is down')).mockResolvedValue(settings())
    renderWithProviders(<SettingsScreen />)
    expect(await screen.findByText(/Server is down/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await findPriestName()).toBeInTheDocument()
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('offers a retry when closures cannot be loaded', async () => {
    signIn('staff')
    const spy = vi.spyOn(settingsData, 'fetchBlackouts').mockRejectedValueOnce(new Error('Closures down')).mockResolvedValue([])
    renderWithProviders(<SettingsScreen />, { route: '/settings?tab=blackouts' })
    expect(await screen.findByText(/Closures down/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('No upcoming closures.')).toBeInTheDocument()
    expect(spy).toHaveBeenCalledTimes(2)
  })
})
