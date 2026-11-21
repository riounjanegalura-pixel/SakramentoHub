import * as React from "react"
import { cn } from "@/lib/utils"
import { Label } from "@/components/ui/label"

type FieldProps = {
  /** Id given to the control; the label, description and error ids derive from it. */
  id: string
  /** Visible label. Every input has one (spec section 10). */
  label: React.ReactNode
  description?: React.ReactNode
  /** Says what happened and what to do; the control keeps what the person typed. */
  error?: React.ReactNode
  /** Stated in words ("Required"), never only an asterisk. */
  required?: boolean
  className?: string
  /** One control: Input, Textarea, SelectTrigger, Checkbox. */
  children: React.ReactElement<Record<string, unknown>>
}

/**
 * Label, control, description and error wired together: the label is associated
 * with the control, `aria-describedby` lists the description and error ids, and
 * `aria-invalid="true"` is set while there is an error. The error has
 * role="alert" so it is announced when it appears.
 */
function Field({ id, label, description, error, required, className, children }: FieldProps) {
  const descriptionId = description ? `${id}-description` : undefined
  const errorId = error ? `${id}-error` : undefined
  const existing = children.props["aria-describedby"] as string | undefined
  const describedBy = [existing, descriptionId, errorId].filter(Boolean).join(" ") || undefined

  const control = React.cloneElement(children, {
    id,
    "aria-describedby": describedBy,
    "aria-invalid": error ? true : children.props["aria-invalid"],
    ...(required ? { required: true } : {}),
  })

  return (
    <div data-slot="field" className={cn("grid gap-1.5", className)}>
      <Label htmlFor={id} className="flex-wrap">
        <span>{label}</span>
        {required && (
          <span className="text-label font-normal text-ink-muted">Required</span>
        )}
      </Label>
      {description && (
        <p id={descriptionId} className="text-sm text-ink-muted">
          {description}
        </p>
      )}
      {control}
      {error && (
        <p id={errorId} role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  )
}

export { Field }
export type { FieldProps }
