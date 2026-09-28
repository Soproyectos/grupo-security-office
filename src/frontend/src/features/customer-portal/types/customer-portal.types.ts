export type PortalAccountType = 'FINAL_CUSTOMER' | 'INSTALLER'

export interface PortalAccount {
  id: string
  email: string
  type: PortalAccountType
}

export interface CatalogProduct {
  id: string
  sku: string
  name: string
  description: string | null
  category: { name: string; slug: string }
  brand: { name: string; slug: string }
  image: { url: string; alt: string | null } | null
  price?: { value: string; currency: string } | null
}

export interface CatalogResponse {
  data: CatalogProduct[]
  meta: { total: number; page: number; pageSize: number; totalPages: number }
}

export interface CatalogFilters {
  search?: string
  category?: string
  brand?: string
  page?: number
  pageSize?: number
}

export interface PortalRegistration {
  email: string
  password: string
  contactName: string
  companyName: string
  documentId?: string
  phone?: string
  type: PortalAccountType
}

export interface PendingPortalAccount extends PortalAccount {
  contactName: string
  companyName: string
  documentId: string | null
  phone: string | null
  state: 'PENDING'
  createdAt: string
}
