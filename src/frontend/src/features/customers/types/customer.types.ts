export const CUSTOMER_STATUSES = ['LEAD', 'CLIENTE', 'INACTIVO'] as const
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number]

export const CUSTOMER_SOURCES = [
  'REFERIDO',
  'PROMOCION',
  'LLAMADA_FRIA',
  'WEB',
  'EVENTO',
  'OTRO',
] as const
export type CustomerSource = (typeof CUSTOMER_SOURCES)[number]

export const CUSTOMER_STATUS_LABELS: Record<CustomerStatus, string> = {
  LEAD: 'Lead',
  CLIENTE: 'Cliente',
  INACTIVO: 'Inactivo',
}

export const CUSTOMER_SOURCE_LABELS: Record<CustomerSource, string> = {
  REFERIDO: 'Referido',
  PROMOCION: 'Promoción',
  LLAMADA_FRIA: 'Llamada en frío',
  WEB: 'Web',
  EVENTO: 'Evento',
  OTRO: 'Otro',
}

export interface Customer {
  id: string
  code: string
  name: string
  documentType: string | null
  documentId: string | null
  /** Check digit of a NIT, calculated by the server (read only); null when not a NIT. */
  documentDv?: number | null
  email: string | null
  phone: string | null
  city: string | null
  address: string | null
  status: CustomerStatus
  source: CustomerSource | null
  sourceDetail: string | null
  ownerId: string | null
  createdById: string | null
  convertedAt: string | null
  lastContactAt: string | null
  notes: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface CustomerFilters {
  search?: string
  status?: CustomerStatus
  ownerId?: string
}

export interface CustomerListMeta {
  total: number
  skip: number
  take: number
  totalPages: number
}

export interface CustomerListResponse {
  data: Customer[]
  meta: CustomerListMeta
}

export interface CustomerPayload {
  name: string
  documentType?: string
  documentId?: string
  email?: string
  phone?: string
  city?: string
  address?: string
  status?: CustomerStatus
  source?: CustomerSource
  sourceDetail?: string
  notes?: string
}
