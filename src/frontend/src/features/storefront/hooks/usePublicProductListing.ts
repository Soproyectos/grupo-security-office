import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  const subcategory = filters.subcategory ?? ''
  const brand = filters.brand ?? ''
  const keySpecKey = (filters.keySpec ?? []).join('\u0000')
  const keySpec = useMemo(() => (keySpecKey === '' ? [] : keySpecKey.split('\u0000')), [keySpecKey])
  const active = q !== '' || category !== '' || subcategory !== '' || brand !== '' || keySpec.length > 0

  const [status, setStatus] = useState<ProductListingStatus>(active ? 'loading' : 'idle')
  const [items, setItems] = useState<PublicProductResult[]>([])
  const [total, setTotal] = useState(0)
  const [attempt, setAttempt] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadMoreError, setLoadMoreError] = useState(false)
  const requestVersion = useRef(0)

  useEffect(() => {
    requestVersion.current += 1
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

    fetchPublicProducts({ q, category, subcategory, brand, keySpec })
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
  }, [q, category, subcategory, brand, keySpec, active, attempt])

  const loadMore = useCallback(() => {
    if (loadingMore || status !== 'ready') return
    const version = requestVersion.current
    setLoadingMore(true)
    setLoadMoreError(false)

    fetchPublicProducts({ q, category, subcategory, brand, keySpec }, items.length)
      .then((page) => {
        if (version !== requestVersion.current) return
        setItems((current) => [...current, ...page.items])
        setTotal(page.total)
      })
      .catch(() => {
        if (version === requestVersion.current) setLoadMoreError(true)
      })
      .finally(() => {
        if (version === requestVersion.current) setLoadingMore(false)
      })
  }, [q, category, subcategory, brand, keySpec, items.length, loadingMore, status])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  const hasMore = status === 'ready' && items.length < total

  return { status, items, total, hasMore, loadingMore, loadMoreError, loadMore, retry }
}

export type PublicProductListingState = ReturnType<typeof usePublicProductListing>
