import { useState } from 'react'
import { Link } from 'react-router-dom'
import QuantityStepper from './QuantityStepper'

export interface QuoteAction {
  /** Adds the product; returns false when the list is full (100 products). */
  add: (quantity: number) => boolean
  /** Units of this product already in the list (0 when none). */
  inList: number
}

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-security-500'
export const ADD_TO_QUOTE_LABEL = 'Agregar a mi cotización'

/**
 * "Agregar a mi cotización" for a signed-in client with an active account. Optional quantity stepper (detail page).
 * The confirmation is a polite live message with a link to the list; nothing moves on the page.
 */
export default function AddToQuoteButton({ action, productName, withQuantity = false, className }: { action: QuoteAction; productName: string; withQuantity?: boolean; className: string }) {
  const [quantity, setQuantity] = useState(1)
  const [full, setFull] = useState(false)
  const onAdd = () => {
    const ok = action.add(quantity)
    setFull(!ok)
    if (ok) setQuantity(1)
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        {withQuantity && <QuantityStepper value={quantity} onChange={setQuantity} label={productName} />}
        <button type="button" onClick={onAdd} className={`${className} min-h-11 ${FOCUS}`}>{ADD_TO_QUOTE_LABEL}</button>
      </div>
      <p role="status" aria-live="polite" className="text-sm text-ink-600">
        {full
          ? 'Tu cotización ya tiene 100 productos. Envíala o quita alguno para seguir.'
          : action.inList > 0
            ? <>En tu cotización: {action.inList} {action.inList === 1 ? 'unidad' : 'unidades'}. <Link to="/clientes/cotizacion" className={`inline-flex min-h-11 items-center font-semibold underline !text-security-600 ${FOCUS}`}>Ver mi cotización</Link></>
            : ''}
      </p>
    </div>
  )
}
