import { useCustomerPortalAuthStore } from '../../../stores/customer-portal-auth.store'
import { useQuery } from '@tanstack/react-query'
import { fetchCustomerCatalog, fetchCustomerCatalogProduct, fetchPublicCatalog, fetchPublicCatalogProduct } from '../../../services/customer-portal.service'
import type { CatalogFilters } from '../types/customer-portal.types'

export function usePublicCatalog(filters: CatalogFilters) {
  return useQuery({ queryKey: ['customer-portal', 'public-catalog', filters], queryFn: () => fetchPublicCatalog(filters) })
}

export function useCustomerCatalog(filters: CatalogFilters) {
  const account=useCustomerPortalAuthStore(s=>s.account)
  return useQuery({ queryKey: ['customer-portal', 'private-catalog', account?.id, account?.tier?.id, filters], queryFn: () => fetchCustomerCatalog(filters), retry: false })
}

export function usePublicCatalogProduct(id?: string) {
  return useQuery({ queryKey: ['customer-portal', 'public-catalog', id], queryFn: () => fetchPublicCatalogProduct(id!), enabled: Boolean(id) })
}

export function useCustomerCatalogProduct(id?: string) {
  const account=useCustomerPortalAuthStore(s=>s.account)
  return useQuery({ queryKey: ['customer-portal', 'private-catalog', account?.id, account?.tier?.id, id], queryFn: () => fetchCustomerCatalogProduct(id!), enabled: Boolean(id), retry: false })
}
