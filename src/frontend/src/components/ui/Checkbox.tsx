import { forwardRef, useEffect, useRef, useImperativeHandle, type InputHTMLAttributes } from 'react'

interface CheckboxProps extends InputHTMLAttributes<HTMLInputElement> {
  indeterminate?: boolean
  label?: string
}

/** Checkbox básico con soporte para estado indeterminado via ref */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ indeterminate, label, className = '', id, ...props }, ref) => {
    const checkboxId = id || `checkbox-${Math.random().toString(36).slice(2, 9)}`
    const inputRef = useRef<HTMLInputElement>(null)

    useImperativeHandle(ref, () => inputRef.current!, [])

    useEffect(() => {
      if (inputRef.current) {
        inputRef.current.indeterminate = Boolean(indeterminate)
      }
    }, [indeterminate])

    return (
      <label className={`inline-flex items-center gap-2 cursor-pointer ${className}`}>
        <input
          ref={inputRef}
          type="checkbox"
          id={checkboxId}
          className="h-4 w-4 shrink-0 rounded border-gray-300 text-security-600 focus:ring-2 focus:ring-security-500/30 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          {...props}
        />
        {label && <span className="text-sm text-gray-700">{label}</span>}
      </label>
    )
  },
)

Checkbox.displayName = 'Checkbox'

/** Alias para compatibilidad con código que use CheckboxField */
export const CheckboxField = Checkbox