import { useCallback, useEffect, useState } from 'react'
import { fetchPublicProducts } from '../../../services/public-catalog.service'
import type { PublicProductFilters, PublicProductResult } from '../types/publicProduct'

export type ProductListingStatus = 'idle' | 'loading' | 'ready' | 'error'

/**
 * State of a paginated public listing: `idle` without any filter, `loading`
 * and `ready` for the first page, `error` on an HTTP failure. `loadMore`
 * appends the next page (offset = items already shown); its own failure keeps
 * the items on screen and only raises `loadMoreError`. The attempt counter is
 * what `retry` bumps, so the same filters can be fetched again after a failure.
 */
export function usePublicProductListing(filters: PublicProductFilters) {
  const q = (filters.q ?? '').trim()
  const category = filters.category ?? ''
  const active = q !== '' || category !== ''

  const [status, setStatus] = useState<ProductListingStatus>(active ? 'loading' : 'idle')
  const [items, setItems] = useState<PublicProductResult[]>([])
  const [total, setTotal] = useState(0)
  const [attempt, setAttempt] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadMoreError, setLoadMoreError] = useState(false)

  useEffect(() => {
    setItems([])
    setTotal(0)
    setLoadingMore(false)
    setLoadMoreError(false)

    if (!active) {
      setStatus('idle')
      return
    }

    // A stale response of a previous filter (or of a retried attempt) must not
    // overwrite the current one: the effect is cancelled on cleanup.
    let cancelled = false
    setStatus('loading')

    fetchPublicProducts({ q, category })
      .then((page) => {
        if (cancelled) return
        setItems(page.items)
        setTotal(page.total)
        setStatus('ready')
      })
      .catch(() => {
        if (cancelled) return
        setStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [q, category, active, attempt])

  const loadMore = useCallback(() => {
    if (loadingMore || status !== 'ready') return
    setLoadingMore(true)
    setLoadMoreError(false)

    fetchPublicProducts({ q, category }, items.length)
      .then((page) => {
        setItems((current) => [...current, ...page.items])
        setTotal(page.total)
      })
      .catch(() => setLoadMoreError(true))
      .finally(() => setLoadingMore(false))
  }, [q, category, items.length, loadingMore, status])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  const hasMore = status === 'ready' && items.length < total

  return { status, items, total, hasMore, loadingMore, loadMoreError, loadMore, retry }
}

export type PublicProductListingState = ReturnType<typeof usePublicProductListing>
