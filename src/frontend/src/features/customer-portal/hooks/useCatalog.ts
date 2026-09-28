import { useQuery } from '@tanstack/react-query'
import { fetchCustomerCatalog, fetchCustomerCatalogProduct, fetchPublicCatalog, fetchPublicCatalogProduct } from '../../../services/customer-portal.service'
import type { CatalogFilters } from '../types/customer-portal.types'

export function usePublicCatalog(filters: CatalogFilters) {
  return useQuery({ queryKey: ['customer-portal', 'public-catalog', filters], queryFn: () => fetchPublicCatalog(filters) })
}

export function useCustomerCatalog(filters: CatalogFilters) {
  return useQuery({ queryKey: ['customer-portal', 'private-catalog', filters], queryFn: () => fetchCustomerCatalog(filters), retry: false })
}

export function usePublicCatalogProduct(id?: string) {
  return useQuery({ queryKey: ['customer-portal', 'public-catalog', id], queryFn: () => fetchPublicCatalogProduct(id!), enabled: Boolean(id) })
}

export function useCustomerCatalogProduct(id?: string) {
  return useQuery({ queryKey: ['customer-portal', 'private-catalog', id], queryFn: () => fetchCustomerCatalogProduct(id!), enabled: Boolean(id), retry: false })
}
