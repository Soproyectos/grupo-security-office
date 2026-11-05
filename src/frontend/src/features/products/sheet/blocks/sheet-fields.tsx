import type { ReactNode } from 'react'
import { Button } from '../../../../components/ui'
import { appendItem, moveItem, newTextRow, removeAt, replaceAt, type TextRow } from '../sheet-form'

// Shared field primitives for the sheet blocks. Visual classes are unchanged from the former single editor.
export const inputClass =
  'w-full px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-focus-ring)] focus:border-[var(--color-primary)] text-sm bg-white'
export const invalidClass = 'border-red-400'
export const iconButtonClass =
  'px-2 py-1 text-xs rounded border border-neutral-200 text-neutral-600 hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed'
/** Touch-sized toggle of a collapsed block (a <details> summary). */
export const disclosureSummaryClass =
  'flex min-h-[44px] items-center cursor-pointer rounded text-sm font-medium text-security-600 hover:text-security-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-focus-ring)]'

export function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="block text-sm font-medium text-neutral-700">{label}</span>
      {children}
      {hint && !error && <span className="block text-xs text-neutral-400">{hint}</span>}
      {error && (
        <span role="alert" className="block text-xs text-red-600">
          {error}
        </span>
      )}
    </label>
  )
}

export function RowControls({
  index,
  count,
  onMove,
  onRemove,
  noun,
}: {
  index: number
  count: number
  onMove: (direction: -1 | 1) => void
  onRemove: () => void
  noun: string
}) {
  return (
    <div className="flex items-center gap-1 shrink-0">
      <button type="button" className={iconButtonClass} aria-label={`Subir ${noun} ${index + 1}`} disabled={index === 0} onClick={() => onMove(-1)}>
        ↑
      </button>
      <button type="button" className={iconButtonClass} aria-label={`Bajar ${noun} ${index + 1}`} disabled={index === count - 1} onClick={() => onMove(1)}>
        ↓
      </button>
      <button type="button" className={`${iconButtonClass} text-red-600 hover:bg-red-50`} aria-label={`Quitar ${noun} ${index + 1}`} onClick={onRemove}>
        Quitar
      </button>
    </div>
  )
}

export function TextListEditor({
  rows,
  onChange,
  noun,
  placeholder,
  addLabel,
  multiline = false,
  error,
  max,
}: {
  rows: TextRow[]
  onChange: (rows: TextRow[]) => void
  noun: string
  placeholder: string
  addLabel: string
  multiline?: boolean
  error?: string
  max: number
}) {
  return (
    <div className="space-y-2">
      {rows.length === 0 && <p className="text-sm text-neutral-400">Sin elementos todavía.</p>}
      {rows.map((row, index) => {
        const common = {
          value: row.value,
          placeholder,
          'aria-label': `${noun} ${index + 1}`,
          className: inputClass,
          onChange: (e: { target: { value: string } }) => onChange(replaceAt(rows, index, { ...row, value: e.target.value })),
        }
        return (
          <div key={row.uid} className="flex items-start gap-2">
            {multiline ? <textarea rows={2} {...common} /> : <input type="text" {...common} />}
            <RowControls index={index} count={rows.length} noun={noun} onMove={(d) => onChange(moveItem(rows, index, d))} onRemove={() => onChange(removeAt(rows, index))} />
          </div>
        )
      })}
      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
      <Button type="button" variant="secondary" disabled={rows.length >= max} onClick={() => onChange(appendItem(rows, newTextRow()))}>
        {addLabel}
      </Button>
    </div>
  )
}
