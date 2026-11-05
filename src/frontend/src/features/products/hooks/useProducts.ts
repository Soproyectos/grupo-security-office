import { useQuery } from '@tanstack/react-query'
import api from '../../../services/api'
import type { Category, Brand, ProductListResponse } from '../types/product.types'

export interface ProductFilters {
  search?: string
  categoryIds?: string[]
  brandIds?: string[]     // Se usa para el frontend, pero solo enviamos el primero al backend
  lifecycleStatuses?: string[] // Se aplica en frontend
  isVisible?: boolean
  isActive?: boolean
  activeListaOnly?: boolean
}

interface UseProductsOptions {
  filters: ProductFilters
  page: number
  pageSize: number
}

export function buildProductsQueryParams(filters: ProductFilters, skip: number, take: number): URLSearchParams {
  const params = new URLSearchParams()
  params.set('skip', String(skip))
  params.set('take', String(take))
  if (filters.search) params.set('search', filters.search)
  const categoryIds = [...new Set(filters.categoryIds ?? [])]
  if (categoryIds.length > 0) params.set('categoryIds', categoryIds.join(','))
  const brandIds = filters.brandIds ?? []
  if (brandIds.length > 0) params.set('brandId', brandIds[0]!)
  if (filters.isVisible !== undefined) params.set('isVisible', String(filters.isVisible))
  if (filters.isActive !== undefined) params.set('isActive', String(filters.isActive))
  if (filters.activeListaOnly) params.set('activeListaOnly', 'true')
  return params
}

export function useProducts({ filters, page, pageSize }: UseProductsOptions) {
  const skip = (page - 1) * pageSize

  const productsQuery = useQuery({
    queryKey: ['products', filters, page, pageSize],
    queryFn: async () => {
      const params = buildProductsQueryParams(filters, skip, pageSize)
      
      const res = await api.get(`/products?${params}`)
      return res.data as ProductListResponse
    },
  })

  const categoriesQuery = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const res = await api.get('/categories')
      return res.data.data as Category[]
    },
  })

  const brandsQuery = useQuery({
    queryKey: ['brands'],
    queryFn: async () => {
      const res = await api.get('/brands')
      return res.data.data as Brand[]
    },
  })

  // Obtener productos del backend
  const backendProducts = productsQuery.data?.data ?? []
  
  // APLICAR FILTROS EN FRONTEND (para múltiples selecciones)
  // Asignar a variables locales para evitar errores TS de "possibly undefined"
  const brandIds = filters.brandIds ?? []
  const lifecycleStatuses = filters.lifecycleStatuses ?? []
  
  let filteredProducts = backendProducts
  
  // Filtrar por múltiples marcas (si hay más de 1 seleccionada)
  if (brandIds.length > 1) {
    filteredProducts = filteredProducts.filter(p => p.brandId !== null && brandIds.includes(p.brandId))
  }
  
  // Filtrar por múltiples estados de ciclo de vida
  if (lifecycleStatuses.length > 0) {
    filteredProducts = filteredProducts.filter(p => p.lifecycleStatus && lifecycleStatuses.includes(p.lifecycleStatus))
  }

  return {
    products: filteredProducts,
    meta: productsQuery.data?.meta,
    total: productsQuery.data?.meta?.total ?? 0,
    categories: categoriesQuery.data ?? [],
    brands: brandsQuery.data ?? [],
    isLoading: productsQuery.isLoading,
    error: productsQuery.error ?? categoriesQuery.error ?? brandsQuery.error,
  }
}
