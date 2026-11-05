import type { ReactNode } from 'react'
import { helpId } from './field-help-id'

interface FieldHelpProps {
  /** Id of the control this text describes. */
  forId: string
  children: ReactNode
}

/** Short visible help under a form field, announced by screen readers through `aria-describedby`. */
export default function FieldHelp({ forId, children }: FieldHelpProps) {
  return (
    <p id={helpId(forId)} className="text-xs leading-relaxed text-[var(--color-text-secondary)]">
      {children}
    </p>
  )
}
