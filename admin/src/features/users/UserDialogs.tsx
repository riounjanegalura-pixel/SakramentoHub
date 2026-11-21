import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useIsPhone } from '../../lib/hooks/useIsPhone'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../components/ui/dialog'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '../../components/ui/sheet'
import { createStaffUser, deactivateUser } from '../../lib/data/users'
import type { User } from '../../lib/types'
import { BTN_DANGER, BTN_OUTLINE, BTN_PRIMARY, REG_DIALOG_NARROW, REG_INPUT, RegField } from '../register/registerForm'

const TITLE = 'font-display text-2xl font-semibold leading-tight text-navy'
const DESC = 'text-[14px] leading-normal text-ink-muted'

/** A centred dialog on a desktop, a bottom sheet on a phone. */
function Shell({ title, description, onClose, children }: { title: string; description: string; onClose: () => void; children: React.ReactNode }) {
  const phone = useIsPhone()
  const head = (
    <div>
      {phone ? <SheetTitle className={`mb-1.5 ${TITLE}`}>{title}</SheetTitle> : <DialogTitle className={`mb-1.5 ${TITLE}`}>{title}</DialogTitle>}
      {phone ? <SheetDescription className={DESC}>{description}</SheetDescription> : <DialogDescription className={DESC}>{description}</DialogDescription>}
    </div>
  )
  if (phone) {
    return (
      <Sheet open onOpenChange={(o) => !o && onClose()}>
        <SheetContent side="bottom" className="max-h-[92vh] gap-4 overflow-y-auto rounded-t-[20px] bg-paper px-4 pb-6 pt-2.5">
          <div aria-hidden="true" className="mx-auto h-1 w-10 rounded-sm bg-hollow" />
          {head}
          {children}
        </SheetContent>
      </Sheet>
    )
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={REG_DIALOG_NARROW}>
        {head}
        {children}
      </DialogContent>
    </Dialog>
  )
}

const FOOTER = 'flex flex-col-reverse gap-2.5 pt-2 md:flex-row md:justify-end [&>*]:max-md:w-full'

export function NewUserDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [v, setV] = useState({ fullName: '', email: '', phone: '', password: '' })
  const [tried, setTried] = useState(false)
  const create = useMutation({ mutationFn: createStaffUser, onSuccess: onCreated })
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV((p) => ({ ...p, [k]: e.target.value }))

  const errors = {
    fullName: v.fullName.trim().length < 2 ? 'Enter the full name.' : '',
    email: /^\S+@\S+\.\S+$/.test(v.email.trim()) ? '' : 'Enter an email address, like name@parish.org.',
    password: v.password.length < 8 ? 'Use at least 8 characters.' : '',
  }
  const invalid = Object.values(errors).some(Boolean)
  const show = (k: keyof typeof errors) => (tried ? errors[k] : '')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setTried(true)
    if (invalid) return
    create.mutate({ fullName: v.fullName.trim(), email: v.email.trim(), phone: v.phone.trim(), password: v.password, role: 'admin' })
  }

  return (
    <Shell title="New admin account" description="They can sign in right away with this password. Ask them to change it after their first sign in." onClose={onClose}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <RegField label="Full name" htmlFor="nu-name" required error={show('fullName')}>
          <input id="nu-name" value={v.fullName} onChange={set('fullName')} autoComplete="off" aria-invalid={Boolean(show('fullName'))} className={REG_INPUT} />
        </RegField>
        <RegField label="Email" htmlFor="nu-email" required error={show('email')}>
          <input id="nu-email" type="email" value={v.email} onChange={set('email')} autoComplete="off" aria-invalid={Boolean(show('email'))} className={REG_INPUT} />
        </RegField>
        <RegField label="Phone" htmlFor="nu-phone" optional>
          <input id="nu-phone" type="tel" value={v.phone} onChange={set('phone')} className={REG_INPUT} />
        </RegField>
        <RegField label="Initial password" htmlFor="nu-pass" required error={show('password')}>
          <input id="nu-pass" type="password" value={v.password} onChange={set('password')} autoComplete="new-password" aria-invalid={Boolean(show('password'))} className={REG_INPUT} />
        </RegField>
        {create.isError && <p role="alert" className="text-[14px] font-medium text-danger">{(create.error as Error).message}</p>}
        <div className={FOOTER}>
          <button type="button" onClick={onClose} className={BTN_OUTLINE}>Cancel</button>
          <button type="submit" disabled={create.isPending} className={BTN_PRIMARY}>{create.isPending ? 'Creating…' : 'Create account'}</button>
        </div>
      </form>
    </Shell>
  )
}

export function DeactivateUserDialog({ user, onClose, onDone }: { user: User; onClose: () => void; onDone: () => void }) {
  const mutation = useMutation({ mutationFn: deactivateUser, onSuccess: onDone })
  return (
    <Shell
      title={`Deactivate ${user.fullName}?`}
      description="They will be signed out now and will not be able to sign in until you reactivate the account. Their records and history stay."
      onClose={onClose}
    >
      {mutation.isError && <p role="alert" className="text-[14px] font-medium text-danger">{(mutation.error as Error).message}</p>}
      <div className={FOOTER}>
        <button type="button" onClick={onClose} className={BTN_OUTLINE}>Keep active</button>
        <button type="button" disabled={mutation.isPending} onClick={() => mutation.mutate(user.id)} className={BTN_DANGER}>
          {mutation.isPending ? 'Deactivating…' : 'Deactivate account'}
        </button>
      </div>
    </Shell>
  )
}
