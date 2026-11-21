import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { TriangleAlert } from 'lucide-react'
import { AppShell } from '../../components/shared/AppShell'
import { AppHeader } from '../../components/shared/AppHeader'
import { ConfirmDialog } from '../../components/shared/ConfirmDialog'
import { Button } from '../../components/ui/button'
import { Field, FieldErrorAlertContext } from '../../components/ui/field'
import { Input } from '../../components/ui/input'
import { deleteAccountSchema, type DeleteAccountInput } from './schema'
import { deleteAccount } from '../../lib/data/account'
import { useAuthStore } from '../../stores/auth-store'
import { clearAuthToken } from '../../lib/api/client'
import { queryClient } from '../../lib/query-client'
import { FOCUS, FormAlert, PendingStatus, useServerErrors } from '../auth/authForm'
import { useSlowRequestNotice } from '../../hooks/useSlowRequestNotice'
import { cn } from '../../lib/utils'

/**
 * The real, end-to-end delivery of the deletion right PrivacyNoticeScreen
 * describes. The page explains what is deleted; the destructive button opens a
 * confirm (a drawer on a phone, a dialog on a desktop) that re-enters the
 * current password (same safety check as ChangePasswordScreen) and requires an
 * explicit "this cannot be undone" acknowledgement, then calls the real
 * DELETE /me endpoint, logs the user out and redirects to a public screen.
 * Never leaves the app sitting on an authenticated-but-deleted session.
 */
export function DeleteAccountScreen() {
  const navigate = useNavigate()
  const [confirming, setConfirming] = useState(false)
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors },
  } = useForm<DeleteAccountInput>({ resolver: zodResolver(deleteAccountSchema) })

  const mutation = useMutation({
    mutationFn: (data: DeleteAccountInput) => deleteAccount(data.currentPassword),
    onSuccess: async () => {
      // The backend has already revoked every token for this account — clear
      // the locally-stored one too (logoutStore also calls the /logout
      // endpoint, which would 401 on an already-deleted account, so clear
      // the token directly instead of going through the normal logout call).
      clearAuthToken()
      useAuthStore.setState({ user: null })
      queryClient.clear()
      navigate('/login', { replace: true, state: { accountDeleted: true } })
    },
  })
  const isSlow = useSlowRequestNotice(mutation.isPending)
  const server = useServerErrors(mutation.error, setError, ['currentPassword', 'confirmDeletion'])

  function handleOpenChange(open: boolean) {
    if (!open && mutation.isPending) return
    setConfirming(open)
    if (!open) {
      reset()
      mutation.reset()
    }
  }

  const checkErrorId = errors.confirmDeletion ? 'confirmDeletion-error' : undefined

  return (
    <AppShell showBottomNav={false} webFrame header={<AppHeader title="Delete My Account" onBack={() => navigate(-1)} />}>
      <section aria-labelledby="delete-heading" className="mx-auto w-full max-w-xl px-4 py-6">
        <h2 id="delete-heading" className="mb-4 font-display text-xl font-semibold text-danger">
          Delete account
        </h2>
        <div className="flex gap-3 rounded-2xl border border-danger bg-status-rejected-bg p-4 text-status-rejected-fg">
          <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <p className="text-sm font-medium">
            This permanently deletes your account and personal information. This cannot be
            undone. Your past booking records are kept (without your personal details) for
            the parish&apos;s own sacramental recordkeeping.
          </p>
        </div>

        <Button type="button" variant="destructive" className="mt-6 w-full" onClick={() => setConfirming(true)}>
          Delete my account
        </Button>
      </section>

      <ConfirmDialog
        open={confirming}
        onOpenChange={handleOpenChange}
        title="Delete your account?"
        description="This cannot be undone. Enter your password to confirm it is you."
      >
        <form noValidate onSubmit={handleSubmit((data) => mutation.mutate(data))} className="grid gap-4">
          {server.message && <FormAlert message={server.message} takeFocus={!server.mapped} />}
          <FieldErrorAlertContext.Provider value={!server.message}>
            <Field id="currentPassword" label="Current password" required error={errors.currentPassword?.message}>
              <Input type="password" autoComplete="current-password" placeholder="Enter your current password" {...register('currentPassword')} />
            </Field>

            {/* A checkbox row: the control sits beside its sentence, so it is wired like Field (label, aria-invalid,
                described-by error) without Field's stacked layout. */}
            <div className="grid gap-1.5">
              <label htmlFor="confirmDeletion" className="flex min-h-11 items-start gap-3 text-sm text-ink">
                <input
                  id="confirmDeletion"
                  type="checkbox"
                  aria-invalid={errors.confirmDeletion ? true : undefined}
                  aria-describedby={checkErrorId}
                  {...register('confirmDeletion')}
                  className={cn('mt-0.5 size-5 shrink-0 rounded-[4px] border border-input-border accent-navy', FOCUS)}
                />
                I understand this action is permanent and cannot be undone.
              </label>
              {errors.confirmDeletion && (
                <p id="confirmDeletion-error" role={server.message ? undefined : 'alert'} className="text-sm font-medium text-danger">
                  {errors.confirmDeletion.message}
                </p>
              )}
            </div>
          </FieldErrorAlertContext.Provider>

          <PendingStatus pending={mutation.isPending} slow={isSlow}>
            Deleting your account…
          </PendingStatus>

          <div className="grid gap-3">
            <Button type="submit" variant="destructive" disabled={mutation.isPending} loading={mutation.isPending}>
              {mutation.isPending ? 'Deleting…' : 'Permanently delete my account'}
            </Button>
            <Button type="button" variant="outline" disabled={mutation.isPending} loading={mutation.isPending} onClick={() => handleOpenChange(false)}>
              Keep my account
            </Button>
          </div>
        </form>
      </ConfirmDialog>
    </AppShell>
  )
}
