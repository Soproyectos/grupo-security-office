export type PendingFlag = 'noImage' | 'noBrand' | 'noPrice' | 'draft'
export type QueueLayout = 'grid' | 'list'

export interface LibraryProductQueueUrlState {
  search: string
  page: number
  pageSize: number
  layout: QueueLayout
  pending: PendingFlag | null
}

const QUICK_FILTER_IDS: readonly PendingFlag[] = ['noImage', 'noBrand', 'noPrice', 'draft']
const PAGE_SIZE_OPTIONS = [20, 50, 100]
const DEFAULT_PAGE_SIZE = 20

export function parseLibraryProductQueueParams(params: URLSearchParams): LibraryProductQueueUrlState {
  const requestedPage = Number(params.get('page'))
  const requestedPageSize = Number(params.get('pageSize'))
  const pending = params.get('pending')
  return {
    search: params.get('search') ?? '',
    page: Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1,
    pageSize: PAGE_SIZE_OPTIONS.includes(requestedPageSize) ? requestedPageSize : DEFAULT_PAGE_SIZE,
    layout: params.get('view') === 'grid' ? 'grid' : 'list',
    pending: QUICK_FILTER_IDS.includes(pending as PendingFlag) ? pending as PendingFlag : null,
  }
}

export function buildLibraryProductQueueParams(state: LibraryProductQueueUrlState): URLSearchParams {
  const params = new URLSearchParams()
  const search = state.search.trim()
  if (search) params.set('search', search)
  if (state.page > 1) params.set('page', String(state.page))
  if (state.pageSize !== DEFAULT_PAGE_SIZE) params.set('pageSize', String(state.pageSize))
  if (state.layout === 'grid') params.set('view', 'grid')
  if (state.pending) params.set('pending', state.pending)
  return params
}
