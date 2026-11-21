import { toast } from 'sonner'
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { addWalletDocumentFile } from '../../lib/data/wallet'
import type { WalletKind } from '../../lib/types'
import { Button } from '../../components/ui/button'
import { Field } from '../../components/ui/field'
import { Input } from '../../components/ui/input'
import { NATIVE_SELECT } from '../auth/authForm'
import { CARD } from './cards'
import { KINDS, KIND_LABEL, messageOf } from './walletKinds'

/** The "Add a document" form: a file, what kind it is, and whose it is. All three are required. */
export function AddWalletDocumentSheet({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const [file, setFile] = useState<File | null>(null)
  const [kind, setKind] = useState<WalletKind | ''>('')
  const [name, setName] = useState('')
  const [errors, setErrors] = useState<{ file?: string; kind?: string; name?: string }>({})

  const add = useMutation({
    mutationFn: () => addWalletDocumentFile(file!, kind as WalletKind, name.trim()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['wallet'] })
      toast.success('Saved to your documents')
      onClose()
    },
  })

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const next = {
      file: file ? undefined : 'Choose a file',
      kind: kind ? undefined : 'Choose the kind of document',
      name: name.trim() ? undefined : 'Enter whose document this is',
    }
    setErrors(next)
    // The first field that needs attention takes focus (spec section 10).
    const first = next.file ? 'wallet-file' : next.kind ? 'wallet-kind' : next.name ? 'wallet-name' : null
    if (first) {
      document.getElementById(first)?.focus()
      return
    }
    add.mutate()
  }

  return (
    <form onSubmit={submit} noValidate className={`${CARD} mb-3 grid gap-4`}>
      <h3 className="font-semibold text-ink">Add a document</h3>

      <Field id="wallet-file" label="File" required description="JPG, PNG or PDF, up to 5 MB." error={errors.file}>
        <Input type="file" accept=".jpg,.jpeg,.png,.pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </Field>

      <Field id="wallet-kind" label="Kind of document" required error={errors.kind}>
        <select value={kind} onChange={(e) => setKind(e.target.value as WalletKind | '')} className={NATIVE_SELECT}>
          <option value="">Choose…</option>
          {KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
        </select>
      </Field>

      <Field id="wallet-name" label="Whose document is this?" required error={errors.name}>
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoComplete="off" />
      </Field>

      {add.isError && (
        <p className="text-sm font-medium text-danger" role="alert">
          {messageOf(add.error, 'Could not add the document. Try again.')}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={add.isPending} loading={add.isPending}>
          {add.isPending ? 'Saving…' : 'Save to wallet'}
        </Button>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
