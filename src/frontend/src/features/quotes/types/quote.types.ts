/**
 * Tipos del módulo de cotizaciones, alineados con el contrato real del backend
 * (`src/backend/src/modules/commercial/quotes/`).
 *
 * REGLA DEL CONTRATO: todos los campos monetarios llegan como STRING
 * (Prisma serializa Decimal como string). El frontend NUNCA hace aritmética
 * de dinero con ellos: los muestra tal cual (con formato de presentación,
 * sin cálculo).
 */

export const QUOTE_STATUSES = [
  'borrador',
  'enviada',
  'negociacion',
  'ganada',
  'perdida',
  'cancelada',
] as const

/** Estado persistido en base de datos. */
export type QuoteStatus = (typeof QUOTE_STATUSES)[number]

/**
 * Estado EFECTIVO: incluye 'vencida', que el backend computa al leer cuando
 * `validUntil` ya pasó y la cotización sigue abierta. NUNCA se envía al
 * backend (no es un valor persistible ni una transición válida).
 */
export type QuoteEffectiveStatus = QuoteStatus | 'vencida'

export const QUOTE_STATUS_LABELS: Record<QuoteEffectiveStatus, string> = {
  borrador: 'Borrador',
  enviada: 'Enviada',
  negociacion: 'En negociación',
  ganada: 'Ganada',
  perdida: 'Perdida',
  cancelada: 'Cancelada',
  vencida: 'Vencida',
}

/** Ítem de cotización (snapshot: precio/sku/nombre congelados al agregar). */
export interface QuoteItem {
  id: string
  quoteId: string
  position: number
  productId: string | null
  priceId: string | null
  sku: string
  name: string
  listaId: string | null
  priceListId: string | null
  /** Decimal serializado como string por el backend. */
  unitPrice: string
  currency: string
  quantity: number
  /** Decimal (0-100) serializado como string. */
  discountPct: string
  /** Decimal serializado como string (calculado en backend). */
  lineTotal: string
  priceCapturedAt: string
}

/** Cotización tal como la devuelve GET /api/commercial/quotes/:id. */
export interface Quote {
  id: string
  code: string
  customerId: string
  ownerId: string
  listaId: string
  priceListId: string | null
  status: QuoteEffectiveStatus
  currency: string
  /** Decimal como string. */
  subtotal: string
  /** Decimal como string (descuento global, hoy siempre 0 desde UI). */
  discount: string
  /** Decimal como string (porcentaje de impuesto). */
  taxRate: string
  /** Decimal como string. */
  taxAmount: string
  /** Decimal como string. */
  total: string
  validUntil: string | null
  issuedAt: string | null
  closedAt: string | null
  lostReason: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
  items?: QuoteItem[]
  customer?: { id: string; code: string; name: string; status: string } | null
  lista?: { id: string; code: string; name: string; currency: string } | null
  priceList?: { id: string; code: string; name: string; currency: string } | null
  owner?: { id: string; name: string; email: string } | null
}

/** Fila del listado GET /api/commercial/quotes (sin items, con _count). */
export interface QuoteListItem extends Omit<Quote, 'items'> {
  _count?: { items: number }
}

export interface QuoteListMeta {
  total: number
  skip: number
  take: number
  totalPages: number
}

export interface QuoteListResponse {
  data: QuoteListItem[]
  meta: QuoteListMeta
}

export interface QuoteFilters {
  search?: string
  status?: QuoteStatus
  customerId?: string
  ownerId?: string
}

export interface CreateQuotePayload {
  customerId: string
  listaId: string
  priceListId?: string
  validUntil?: string
  taxRate?: string
  notes?: string
}

export interface AddQuoteItemPayload {
  productId: string
  quantity: number
  discountPct?: string
}

export interface UpdateQuoteItemPayload {
  quantity?: number
  discountPct?: string
}

export interface UpdateQuoteStatusPayload {
  status: QuoteStatus
  lostReason?: string
}
