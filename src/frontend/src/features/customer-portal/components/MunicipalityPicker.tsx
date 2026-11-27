import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useMunicipalities } from '../hooks/usePortalQuotes'
import { filterMunicipalities, municipalityLabel } from '../utils/municipality'
import type { PortalMunicipality } from '../types/customer-portal.types'

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-security-500'

interface Props {
  /** DIVIPOLA code of the chosen municipality ('' = none). */
  value: string
  onChange: (code: string) => void
  /** Municipality already known (shows its name before the list arrives). */
  initial?: PortalMunicipality | null
  invalid?: boolean
  describedBy?: string
  label?: string
  /** False when the city is optional (internal panel forms). Default true. */
  required?: boolean
  placeholder?: string
  /** Help line under the field; the default talks to the web visitor. */
  hint?: string
  /** Old free-text city shown while nothing from the list is chosen. */
  legacyText?: string
  /** 'panel' matches the internal form controls; 'storefront' is the web look. */
  variant?: 'storefront' | 'panel'
}

/**
 * Searchable city selector (combobox). The person types part of the name and picks one of the fixed municipalities,
 * so the advisor assignment by zone is exact. Arrow keys move, Enter picks, Escape closes.
 */
export default function MunicipalityPicker({
  value,
  onChange,
  initial = null,
  invalid = false,
  describedBy,
  label = 'Ciudad',
  required = true,
  placeholder = 'Escribe y elige tu ciudad',
  hint = 'Con tu ciudad te asignamos un asesor de tu zona.',
  legacyText = '',
  variant = 'storefront',
}: Props) {
  const baseId = useId()
  const listId = `${baseId}-list`
  const { data, isPending, isError, refetch } = useMunicipalities()
  const list = useMemo(() => data ?? [], [data])
  const selected = useMemo(() => list.find((m) => m.code === value) ?? (initial && initial.code === value ? initial : null), [list, value, initial])
  const [text, setText] = useState(selected ? municipalityLabel(selected) : legacyText)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)

  // Keeps the visible text in step with the chosen city (e.g. the list arrives after the form opens).
  useEffect(() => { if (selected) setText(municipalityLabel(selected)) }, [selected])
  // An old free-text city is shown while no municipality is chosen (it can arrive after the first render).
  useEffect(() => { if (!selected && legacyText) setText(legacyText) }, [legacyText, selected])
  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => { if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const showingKnownText = (selected && text === municipalityLabel(selected)) || (legacyText !== '' && text === legacyText)
  const options = useMemo(() => (open ? filterMunicipalities(list, showingKnownText ? '' : text) : []), [open, list, text, showingKnownText])
  const optionId = (index: number) => `${baseId}-opt-${index}`

  function pick(option: PortalMunicipality) {
    onChange(option.code)
    setText(municipalityLabel(option))
    setOpen(false)
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') { event.preventDefault(); if (!open) setOpen(true); else setActive((i) => Math.min(options.length - 1, i + 1)) }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive((i) => Math.max(0, i - 1)) }
    else if (event.key === 'Enter' && open && options[active]) { event.preventDefault(); pick(options[active]!) }
    else if (event.key === 'Escape' && open) { event.preventDefault(); setOpen(false) }
  }

  return (
    <div ref={rootRef} className="relative text-sm font-medium">
      <label htmlFor={`${baseId}-input`} className={variant === 'panel' ? 'block text-neutral-800' : undefined}>{label}</label>
      <input
        id={`${baseId}-input`}
        name="city"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && options[active] ? optionId(active) : undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy ? `${describedBy} ${baseId}-hint` : `${baseId}-hint`}
        autoComplete="off"
        required={required}
        placeholder={placeholder}
        value={text}
        disabled={isPending && !selected && !legacyText}
        onChange={(event) => { setText(event.target.value); setActive(0); setOpen(true); if (value) onChange('') }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className={
          variant === 'panel'
            ? `mt-1.5 min-h-11 w-full rounded-lg border bg-white px-4 py-2.5 text-sm font-normal placeholder-neutral-400 disabled:bg-neutral-100 disabled:cursor-not-allowed ${invalid ? 'border-brand-error' : 'border-neutral-300'} ${FOCUS}`
            : `mt-1 min-h-12 w-full rounded-control border bg-white px-3 disabled:opacity-60 ${invalid ? 'border-security-600' : 'border-surface-300'} ${FOCUS}`
        }
      />
      <p id={`${baseId}-hint`} className="mt-1 text-sm font-normal text-ink-600">
        {isPending && !selected && !legacyText ? 'Cargando ciudades…' : hint}
      </p>
      {isError && (
        <p role="alert" className="mt-1 text-sm font-normal text-security-600">
          No pudimos cargar las ciudades. <button type="button" onClick={() => void refetch()} className={`min-h-11 font-semibold underline ${FOCUS}`}>Intentar de nuevo</button>
        </p>
      )}
      <ul
        id={listId}
        role="listbox"
        aria-label={`${label}: resultados`}
        hidden={!open}
        className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-card border border-surface-200 bg-white p-1 shadow-lg"
      >
        {options.length === 0 && open && !isPending && <li role="presentation" className="px-3 py-3 text-sm font-normal text-ink-600">No encontramos esa ciudad. Revisa cómo la escribiste.</li>}
        {options.map((option, index) => (
          <li
            key={option.code}
            id={optionId(index)}
            role="option"
            aria-selected={option.code === value}
            onMouseDown={(event) => { event.preventDefault(); pick(option) }}
            onMouseEnter={() => setActive(index)}
            className={`flex min-h-11 cursor-pointer items-center rounded-control px-3 text-sm font-normal text-storefront-ink ${index === active ? 'bg-surface-100' : ''} ${option.code === value ? 'font-semibold' : ''}`}
          >
            {municipalityLabel(option)}
          </li>
        ))}
      </ul>
    </div>
  )
}
