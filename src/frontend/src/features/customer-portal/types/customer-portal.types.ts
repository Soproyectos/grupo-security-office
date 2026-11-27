/** Municipio de la lista fija (DIVIPOLA). */
export interface PortalMunicipality {
  code: string
  name: string
  departmentCode: string
  department: string
}

export type PortalAccountType = 'FINAL_CUSTOMER' | 'INSTALLER'

export interface PortalAccount {
  id: string
  email: string
  type: PortalAccountType
  /** PENDING = en revisión por un asesor; solo ACTIVE ve precios y cotiza. */
  state?: 'PENDING' | 'ACTIVE' | 'REJECTED' | 'SUSPENDED' | null
  city?: PortalMunicipality | null
  /** Pending backend field: false when the account still lacks a linked company or advisor. */
  canQuote?: boolean
  /** Advisor in charge of the company (name only); null while none is assigned. */
  advisor?: { name: string } | null
  contactName?: string
  companyName?: string
  tier?: { id: string; name: string; isActive: boolean } | null
  documentId?: string | null
  phone?: string | null
  privacyAcceptedAt?: string | null
  deletionRequestedAt?: string | null
  profileComplete?: boolean
  hasPassword?: boolean
  linkedProviders?: string[]
}

export interface PortalProfileInput {
  companyName: string
  /** Código DIVIPOLA del municipio. */
  city?: string
  documentId?: string
  phone?: string
  acceptPrivacy?: true
}

export type PortalAdminAccountState = 'PENDING' | 'ACTIVE' | 'REJECTED' | 'SUSPENDED'

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

export interface PendingPortalAccount extends PortalAccount {
  contactName: string
  companyName: string
  documentId: string | null
  phone: string | null
  state: 'PENDING'
  createdAt: string
}

export interface AdminTier {
  id: string
  name: string
  description?: string | null
  isActive: boolean
  priceListId?: string | null
  priceList?: { id: string; name: string; isActive: boolean } | null
}

export interface AdminPriceList { id: string; name: string; isActive: boolean }

export interface AdminPortalAccount {
  id: string
  email: string
  contactName: string
  companyName: string
  documentId?: string | null
  phone?: string | null
  state: PortalAdminAccountState
  type?: PortalAccountType
  /** Ciudad del registro, ya resuelta por el servidor (nombre y departamento). */
  city?: PortalMunicipality | null
  advisorId?: string | null
  advisor?: { id: string; name: string } | null
  customerId?: string | null
  /** La tarifa es de la empresa: el nivel vive en el cliente vinculado. */
  customer?: {
    id: string; code: string; name: string; documentId?: string | null; email?: string | null
    ownerId?: string | null; portalTierId?: string | null
    portalTier?: { id: string; name: string; isActive: boolean } | null
  } | null
  privacyAcceptedAt?: string | null
  deletionRequestedAt?: string | null
  createdAt: string
}

/** Asesor que quien asigna puede elegir (GET admin/advisors). */
export interface AdminAdvisor { id: string; name: string; zone: string | null }

export interface AdminPriceMapping { id: string; type: PortalAccountType; priceListId: string; priceList?: AdminPriceList | null }
