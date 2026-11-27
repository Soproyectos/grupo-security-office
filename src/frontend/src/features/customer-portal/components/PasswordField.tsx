import { forwardRef, useState, type InputHTMLAttributes } from 'react'

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-security-500'

type PasswordFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'id'> & {
  id: string
  label: string
  error?: string
  hint?: string
}

/** Password input with a «Mostrar» / «Ocultar» toggle that keeps the focus in the input. */
const PasswordField = forwardRef<HTMLInputElement, PasswordFieldProps>(function PasswordField(
  { id, label, error, hint, className = '', ...inputProps },
  ref,
) {
  const [visible, setVisible] = useState(false)
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = [hint ? hintId : '', error ? errorId : '', inputProps['aria-describedby'] ?? ''].filter(Boolean).join(' ') || undefined
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm font-medium">{label}</label>
      {hint && <p id={hintId} className="mt-1 text-sm text-ink-700">{hint}</p>}
      <div className="relative mt-1.5">
        <input
          {...inputProps}
          ref={ref}
          id={id}
          type={visible ? 'text' : 'password'}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          className={`min-h-12 w-full rounded-control border border-surface-300 bg-white py-0 pl-3 pr-12${FOCUS}`}
        />
        <button
          type="button"
          aria-pressed={visible}
          aria-controls={id}
          aria-label={`${visible ? 'Ocultar' : 'Mostrar'} ${label.toLowerCase()}`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setVisible((current) => !current)}
          className={`absolute inset-y-0 right-0 min-h-11 min-w-11 rounded-control px-3 !text-security-600 hover:bg-surface-100 ${FOCUS}`}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="mx-auto h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
            <circle cx="12" cy="12" r="3" />
            {visible && <path d="M4 20L20 4" />}
          </svg>
        </button>
      </div>
      {error && <span id={errorId} role="alert" className="mt-1 block text-xs text-security-600">{error}</span>}
    </div>
  )
})

export default PasswordField
