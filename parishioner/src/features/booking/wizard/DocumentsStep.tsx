import { z } from 'zod'
import { DocumentUploadField } from '../../../components/shared/DocumentUploadField'
import { fieldError } from '../../../components/fields/fieldError'
import type { FormValues } from '../../../lib/validation/groups'
import { StepFrame } from './StepFrame'
import { useStepForm } from './useStepForm'
import { docStatus } from './review'
import { documentState } from '../documentState'
import { DocumentStateLine } from '../DocumentStateLine'
import { useEditingBooking } from './useEditingBooking'
import type { WizardStep } from './types'
import { WalletTileExtras } from '../../wallet/WalletTileExtras'
import { WhatToBring } from '../../services/WhatToBring'
import { SACRAMENT_LABEL } from '../../../lib/domain'
import { useWizard } from './WizardContext'

export interface DocSpec {
  key: string
  label: string
  required: boolean | ((d: FormValues) => boolean)
  /** Shown under the label (e.g. "Can follow later"). */
  hint?: string
}

const isRequired = (doc: DocSpec, d: FormValues) => (typeof doc.required === 'function' ? doc.required(d) : doc.required)

export function documentsStep(docs: DocSpec[], title = 'Requirements'): WizardStep {
  const step: WizardStep = {
    id: 'documents',
    title,
    shape: Object.fromEntries(docs.map((doc) => [doc.key, z.string().nullish()])),
    refine: (d, ctx) => {
      for (const doc of docs) {
        if (isRequired(doc, d) && !d[doc.key]) {
          ctx.addIssue({ code: 'custom', path: [doc.key], message: `Upload the ${doc.label}` })
        }
      }
    },
    Component: ({ step: self }) => <DocumentsView step={self} docs={docs} />,
    review: (d) =>
      docs.filter((doc) => isRequired(doc, d) || d[doc.key]).map((doc) => [doc.label.charAt(0).toUpperCase() + doc.label.slice(1), docStatus(d, doc.key)] as [string, string]),
  }
  return step
}

function DocumentsView({ step, docs }: { step: WizardStep; docs: DocSpec[] }) {
  const { form, onContinue } = useStepForm(step)
  const { definition, mode } = useWizard()
  const values = form.watch()
  const editing = useEditingBooking()
  const serverDoc = (key: string) => editing?.documents?.find((d) => d.key === key)

  // A required document staff rejected must be replaced before the booking can go back for review.
  const rejectedAndUnchanged = docs.filter((doc) => {
    const server = serverDoc(doc.key)
    return !!server && isRequired(doc, values) && documentState(server, values[doc.key]).kind === 'rejected'
  })

  const proceed = () => {
    if (rejectedAndUnchanged.length > 0) {
      for (const doc of rejectedAndUnchanged) {
        form.setError(doc.key, { type: 'review', message: `Upload a new file for the ${doc.label} — the parish office could not accept the earlier one.` })
      }
      return
    }
    void onContinue()
  }

  return (
    <StepFrame onContinue={proceed}>
      {/* The step that lists documents offers the full "What to bring" list (documents plus what else to prepare). */}
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="border-t-2 border-navy pt-3 font-display text-[1.375rem] leading-[1.3] font-semibold text-ink">{step.title}</h2>
        <WhatToBring serviceId={definition.sacrament} serviceName={SACRAMENT_LABEL[definition.sacrament]} prepare={definition.prepare} size="sm" withWallet={mode !== 'desk'} />
      </div>
      <p className="mb-4 text-sm text-ink-muted">Clear photos or scans are fine (JPG, PNG or PDF, up to 5 MB each).</p>
      {docs.map((doc) => {
        const required = isRequired(doc, values)
        const server = serverDoc(doc.key)
        return (
          <div key={doc.key}>
            {server && (
              <div className="mb-1">
                <DocumentStateLine state={documentState(server, values[doc.key])} />
              </div>
            )}
            <DocumentUploadField
              id={doc.key}
              label={doc.label}
              description={doc.hint}
              required={required}
              optional={!required}
              value={values[doc.key] as string | undefined}
              error={fieldError(form.formState.errors, doc.key)}
              onUploaded={(url) => {
                form.clearErrors(doc.key)
                form.setValue(doc.key, url, { shouldValidate: true, shouldDirty: true })
              }}
            />
            <WalletTileExtras
              docKey={doc.key}
              value={values[doc.key] as string | undefined}
              onChoose={(url) => {
                form.clearErrors(doc.key)
                form.setValue(doc.key, url, { shouldValidate: true, shouldDirty: true })
              }}
            />
          </div>
        )
      })}
    </StepFrame>
  )
}
