import type { QuoteEffectiveStatus, QuoteStatus } from '../types/quote.types'

/**
 * Matriz de transiciones de cotización. Espejo EXACTO del contrato backend
 * (`QUOTE_TRANSITIONS` en quotes.service.ts) — solo se usa para decidir qué
 * botones mostrar; el backend sigue siendo la autoridad y valida siempre.
 *
 * 'vencida' NO está en la matriz: es un estado efectivo calculado al leer
 * (validUntil pasado + estado abierto). Una cotización vencida no tiene
 * transiciones disponibles hasta que el backend cambie su estado persistido
 * (regla actual del backend: no se puede transicionar desde vencida).
 */
const QUOTE_TRANSITIONS: Record<QuoteEffectiveStatus, QuoteStatus[]> = {
  borrador: ['enviada', 'cancelada'],
  enviada: ['negociacion', 'ganada', 'perdida', 'cancelada'],
  negociacion: ['ganada', 'perdida', 'cancelada'],
  ganada: [],
  perdida: [],
  cancelada: [],
  vencida: [],
}

/** Estados en los que el backend permite agregar/editar/quitar ítems. */
const ITEM_EDITABLE_STATUSES: readonly QuoteEffectiveStatus[] = [
  'borrador',
  'enviada',
  'negociacion',
]

export function allowedTransitions(status: QuoteEffectiveStatus): QuoteStatus[] {
  return QUOTE_TRANSITIONS[status] ?? []
}

export function isTerminalStatus(status: QuoteEffectiveStatus): boolean {
  return allowedTransitions(status).length === 0
}

export function areItemsEditable(status: QuoteEffectiveStatus): boolean {
  return ITEM_EDITABLE_STATUSES.includes(status)
}
