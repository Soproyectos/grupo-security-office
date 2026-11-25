import { useQuery } from '@tanstack/react-query'
import { fetchPublicProducts } from '../../../services/public-catalog.service'
import type { PublicProductFilters } from '../types/publicProduct'

export const PUBLIC_SUBCATEGORY_PAGE_SIZES = [20, 40]

const DEFAULT_PAGE = 1
const DEFAULT_PAGE_SIZE = 20
const MAX_OFFSET = 100_000

function readPositiveInteger(value: string | null, fallback: number): number {
  if (value === null || !/^\d+$/.test(value)) return fallback
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback
}

export function readPublicProductPage(params: Pick<URLSearchParams, 'get'>): { page: number; pageSize: number } {
  const pageSize = readPositiveInteger(params.get('limit'), DEFAULT_PAGE_SIZE)
  const requestedPage = readPositiveInteger(params.get('page'), DEFAULT_PAGE)
  const maxPage = Math.floor(MAX_OFFSET / pageSize) + 1
  return { page: Math.min(requestedPage, maxPage), pageSize }
}

export function usePublicProductPage(
  filters: PublicProductFilters,
  page: number,
  pageSize: number,
  enabled = true,
) {
  const normalizedFilters = {
    q: filters.q ?? '',
    category: filters.category ?? '',
    subcategory: filters.subcategory ?? '',
    brand: filters.brand ?? '',
    keySpec: [...(filters.keySpec ?? [])],
    ...(filters.requirement?.length ? { requirement: [...filters.requirement] } : {}),
  }

  return useQuery({
    queryKey: ['public-products', 'page', normalizedFilters, page, pageSize],
    queryFn: () => fetchPublicProducts(normalizedFilters, (page - 1) * pageSize, pageSize),
    enabled: enabled && Number.isInteger(page) && page >= 1 && Number.isInteger(pageSize) && pageSize >= 1,
  })
}
