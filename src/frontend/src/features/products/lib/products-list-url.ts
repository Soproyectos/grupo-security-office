/** URL <-> state mapping for the Productos list, so filters and page survive a round trip to the sheet editor. */
export interface ProductsListUrlState {
  search: string
  page: number
  pageSize: number
  viewMode: 'grid' | 'list'
  categoryIds: string[]
  brandIds: string[]
  lifecycleStatuses: string[]
}

interface ParseOptions {
  pageSizes: readonly number[]
  defaultPageSize: number
  lifecycleStatuses: readonly string[]
}

const csv = (value: string | null): string[] => (value ? value.split(',').filter(Boolean) : [])

export function parseProductsListParams(params: URLSearchParams, options: ParseOptions): ProductsListUrlState {
  const page = Number(params.get('page'))
  const pageSize = Number(params.get('pageSize'))
  return {
    search: params.get('search') ?? '',
    page: Number.isInteger(page) && page > 0 ? page : 1,
    pageSize: options.pageSizes.includes(pageSize) ? pageSize : options.defaultPageSize,
    viewMode: params.get('view') === 'list' ? 'list' : 'grid',
    categoryIds: csv(params.get('categories')),
    brandIds: csv(params.get('brands')),
    lifecycleStatuses: csv(params.get('status')).filter((status) => options.lifecycleStatuses.includes(status)),
  }
}

/** Defaults are omitted so an untouched list keeps a clean URL. */
export function buildProductsListParams(state: ProductsListUrlState, defaultPageSize: number): URLSearchParams {
  const params = new URLSearchParams()
  if (state.search) params.set('search', state.search)
  if (state.page > 1) params.set('page', String(state.page))
  if (state.pageSize !== defaultPageSize) params.set('pageSize', String(state.pageSize))
  if (state.viewMode === 'list') params.set('view', 'list')
  if (state.categoryIds.length) params.set('categories', state.categoryIds.join(','))
  if (state.brandIds.length) params.set('brands', state.brandIds.join(','))
  if (state.lifecycleStatuses.length) params.set('status', state.lifecycleStatuses.join(','))
  return params
}
