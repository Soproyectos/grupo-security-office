import { Badge, Button } from '../../../components/ui'
import { emptyDraft, isDraftEmpty, keySpecFieldId, type DraftMode, type KeySpecDraft, type KeySpecRow } from '../lib/key-specs'

const inputClass =
  'w-full px-3 py-2.5 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-focus-ring)] focus:border-[var(--color-primary)] text-sm disabled:bg-neutral-50 disabled:text-neutral-500'
const choiceClass =
  'flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border border-neutral-200 px-3 text-sm text-neutral-700 has-[:checked]:border-[var(--color-primary)] has-[:checked]:bg-[var(--color-primary-bg-subtle)] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--color-primary-focus-ring)]'

const MODES: { mode: DraftMode; label: string }[] = [
  { mode: 'value', label: 'Con valor' },
  { mode: 'not_applicable', label: 'No aplica' },
  { mode: 'unknown', label: 'Desconocido' },
]

export interface KeySpecFieldProps {
  row: KeySpecRow
  draft: KeySpecDraft
  /** Problem to show under the field: a local check or the server's rejection. */
  error?: string
  disabled?: boolean
  onChange: (draft: KeySpecDraft) => void
}

/** One datum: value control by type, plus "No aplica", "Desconocido" and "Quitar valor". */
export function KeySpecField({ row, draft, error, disabled, onChange }: KeySpecFieldProps) {
  const { item } = row
  const id = keySpecFieldId(item.specKey)
  const reasonId = `${id}-reason`
  const errorId = `${id}-error`
  const showValue = draft.mode === 'value'
  const canRemove = draft.mode !== 'value' || !isDraftEmpty(item.dataType, draft)
  const activeOptions = item.options.filter((option) => option.isActive !== false || draft.optionKeys.includes(option.key))

  return (
    <div
      id={id}
      tabIndex={-1}
      className="space-y-3 rounded-lg border border-neutral-200 p-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-focus-ring)]"
      data-testid={`key-spec-${item.specKey}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-neutral-800">{item.label}</span>
        {row.requiredCounts && (
          <span
            tabIndex={0}
            title={row.requiredReason ?? 'Dato obligatorio'}
            aria-describedby={row.requiredReason ? reasonId : undefined}
            className="rounded text-xs font-medium text-[var(--color-error)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-focus-ring)]"
          >
            Obligatorio
          </span>
        )}
        {row.proposed && <Badge variant="info">Propuesto</Badge>}
        {row.requiredReason && row.requiredCounts && (
          <span id={reasonId} className="sr-only">
            {row.requiredReason}
          </span>
        )}
      </div>
      {row.proposed && <p className="text-xs text-neutral-500">Propuesto: acepta valores, pero todavía no cuenta como obligatorio ni se publica.</p>}

      <div role="radiogroup" aria-label={`Estado de ${item.label}`} className="flex flex-wrap gap-2">
        {MODES.map(({ mode, label }) => (
          <label key={mode} className={choiceClass}>
            <input
              type="radio"
              name={`${id}-mode`}
              checked={draft.mode === mode}
              disabled={disabled}
              onChange={() => onChange({ ...draft, mode })}
              className="h-4 w-4"
            />
            {label}
          </label>
        ))}
      </div>

      {showValue && (
        <div className="space-y-2">
          {item.dataType === 'TEXT' && (
            <input
              type="text"
              aria-label={item.label}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? errorId : undefined}
              value={draft.text}
              disabled={disabled}
              onChange={(event) => onChange({ ...draft, text: event.target.value })}
              className={inputClass}
            />
          )}
          {item.dataType === 'NUMBER' && (
            <div className="flex items-center gap-2">
              <input
                type="text"
                inputMode="decimal"
                aria-label={item.label}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? errorId : undefined}
                value={draft.number}
                disabled={disabled}
                onChange={(event) => onChange({ ...draft, number: event.target.value })}
                className={inputClass}
              />
              {item.unit && <span className="shrink-0 text-sm text-neutral-600">{item.unit}</span>}
            </div>
          )}
          {item.dataType === 'BOOLEAN' && (
            <div role="radiogroup" aria-label={item.label} className="flex flex-wrap gap-2">
              {[
                { label: 'Sí', value: true },
                { label: 'No', value: false },
              ].map((choice) => (
                <label key={choice.label} className={choiceClass}>
                  <input
                    type="radio"
                    name={`${id}-bool`}
                    checked={draft.boolean === choice.value}
                    disabled={disabled}
                    onChange={() => onChange({ ...draft, boolean: choice.value })}
                    className="h-4 w-4"
                  />
                  {choice.label}
                </label>
              ))}
            </div>
          )}
          {item.dataType === 'OPTION' && (
            <select
              aria-label={item.label}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? errorId : undefined}
              value={draft.optionKeys[0] ?? ''}
              disabled={disabled}
              onChange={(event) => onChange({ ...draft, optionKeys: event.target.value ? [event.target.value] : [] })}
              className={inputClass}
            >
              <option value="">Elegir…</option>
              {activeOptions.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          )}
          {item.dataType === 'MULTI_OPTION' && (
            <div role="group" aria-label={item.label} className="flex flex-wrap gap-2">
              {activeOptions.map((option) => {
                const checked = draft.optionKeys.includes(option.key)
                return (
                  <label key={option.key} className={choiceClass}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={() =>
                        onChange({
                          ...draft,
                          optionKeys: checked ? draft.optionKeys.filter((key) => key !== option.key) : [...draft.optionKeys, option.key],
                        })
                      }
                      className="h-4 w-4"
                    />
                    {option.label}
                  </label>
                )
              })}
            </div>
          )}
        </div>
      )}

      {!showValue && (
        <p className="text-sm text-neutral-600">
          {draft.mode === 'not_applicable' ? 'Este dato no aplica a este producto.' : 'Todavía no se conoce este dato.'}
        </p>
      )}

      {error && (
        <p id={errorId} role="alert" className="text-xs text-[var(--color-error)]">
          {error}
        </p>
      )}

      {canRemove && !disabled && (
        <Button type="button" variant="ghost" className="min-h-[44px]" onClick={() => onChange(emptyDraft())}>
          Quitar valor
        </Button>
      )}
    </div>
  )
}
