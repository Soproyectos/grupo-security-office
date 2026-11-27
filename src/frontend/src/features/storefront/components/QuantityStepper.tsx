import { useEffect, useState } from 'react'
import { QUOTE_LIST_MAX_QUANTITY, clampQuantity } from '../../../stores/portal-quote-list.store'

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-security-500'
const STEP = `inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control border border-surface-300 bg-white text-storefront-ink transition-colors hover:border-storefront-ink disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS}`

function Glyph({ plus }: { plus: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4">
      <path d={plus ? 'M12 5v14M5 12h14' : 'M5 12h14'} />
    </svg>
  )
}

/** Quantity control (1 to 9999): minus, typed number and plus. `label` names the product for assistive technology. */
export default function QuantityStepper({ value, onChange, label, disabled = false }: { value: number; onChange: (quantity: number) => void; label: string; disabled?: boolean }) {
  const [text, setText] = useState(String(value))
  useEffect(() => { setText(String(value)) }, [value])

  const commit = (raw: string) => {
    const parsed = Number.parseInt(raw, 10)
    const next = Number.isNaN(parsed) ? value : clampQuantity(parsed)
    setText(String(next))
    if (next !== value) onChange(next)
  }

  return (
    <div role="group" aria-label={`Cantidad de ${label}`} className="inline-flex items-center gap-1">
      <button type="button" aria-label="Quitar una unidad" disabled={disabled || value <= 1} onClick={() => onChange(clampQuantity(value - 1))} className={STEP}><Glyph plus={false} /></button>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        aria-label={`Cantidad de ${label}`}
        value={text}
        maxLength={4}
        disabled={disabled}
        onChange={(event) => setText(event.target.value.replace(/\D/g, ''))}
        onBlur={(event) => commit(event.target.value)}
        onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commit(text) } }}
        className={`h-11 w-16 rounded-control border border-surface-300 bg-white text-center text-sm font-semibold tabular-nums text-storefront-ink disabled:opacity-40 ${FOCUS}`}
      />
      <button type="button" aria-label="Agregar una unidad" disabled={disabled || value >= QUOTE_LIST_MAX_QUANTITY} onClick={() => onChange(clampQuantity(value + 1))} className={STEP}><Glyph plus /></button>
    </div>
  )
}
