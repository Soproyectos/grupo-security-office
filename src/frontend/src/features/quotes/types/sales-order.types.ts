/**
 * Tipos del Pedido (SalesOrder), alineados con el contrato real del backend
 * (`src/backend/src/modules/commercial/sales-orders/`).
 *
 * REGLA DEL CONTRATO: `total` llega como STRING (Prisma serializa Decimal
 * como string). El frontend NUNCA hace aritmética de dinero con él.
 *
 * Nota de vinculación: el backend NO expone un endpoint "sales order por
 * quoteId". El listado GET /api/commercial/sales-orders acepta `customerId`
 * y cada fila incluye `quote { id }`, así que el detalle de una cotización
 * resuelve su pedido filtrando por customerId y emparejando `quote.id`.
 */

export interface SalesOrderRelatedCustomer {
  id: string
  code: string
  name: string
}

export interface SalesOrderRelatedOwner {
  id: string
  name: string
  email: string
}

export interface SalesOrderRelatedQuote {
  id: string
  code: string
  status: string
}

export interface SalesOrder {
  id: string
  code: string
  quoteId: string
  customerId: string
  ownerId: string
  /** Decimal serializado como string por el backend. */
  total: string
  currency: string
  externalInvoiceNumber: string | null
  externalInvoiceDate: string | null
  externalSystem: string
  notes: string | null
  createdAt: string
  updatedAt: string
  customer?: SalesOrderRelatedCustomer | null
  owner?: SalesOrderRelatedOwner | null
  quote?: SalesOrderRelatedQuote | null
}

export interface SalesOrderListMeta {
  total: number
  skip: number
  take: number
  totalPages: number
}

export interface SalesOrderListResponse {
  data: SalesOrder[]
  meta: SalesOrderListMeta
}

export interface SalesOrderFilters {
  search?: string
  customerId?: string
  ownerId?: string
}

export interface UpdateInvoicePayload {
  externalInvoiceNumber?: string
  externalInvoiceDate?: string | null
}
