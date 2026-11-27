/** Estados que puede mostrar «Mis cotizaciones» (el servidor devuelve el estado efectivo, con vencimiento aplicado). */
export type PortalQuoteStatus = 'borrador' | 'enviada' | 'negociacion' | 'ganada' | 'perdida' | 'cancelada' | 'vencida'

export interface PortalQuoteListItem {
  id: string
  code: string
  status: PortalQuoteStatus | string
  createdAt: string
  issuedAt: string | null
  total: number
  currency: string
  itemCount: number
  hasPendingPrices: boolean
}

export interface PortalQuoteLine {
  id: string
  sku: string
  name: string
  quantity: number
  currency: string
  /** null = «Precio por confirmar»: el asesor lo completa. */
  unitPrice: number | null
  lineTotal: number
}

export interface PortalQuoteHistoryEvent {
  fromStatus: string | null
  toStatus: string
  createdAt: string
  actor: 'Tú' | 'Tu asesor' | 'Tu empresa' | string
}

export interface PortalQuoteDetail {
  id: string
  code: string
  status: PortalQuoteStatus | string
  createdAt: string
  issuedAt: string | null
  validUntil: string | null
  notes: string | null
  currency: string
  subtotal: number
  taxRate: number
  taxAmount: number
  total: number
  advisor: { name: string } | null
  hasPendingPrices: boolean
  items: PortalQuoteLine[]
  history: PortalQuoteHistoryEvent[]
}

export interface PortalQuoteCreated {
  id: string
  code: string
  status: string
  total: number
  currency: string
  itemCount: number
  hasPendingPrices: boolean
}

export interface SendPortalQuoteInput {
  items: Array<{ productId: string; quantity: number }>
  notes?: string
}
