import { useCallback, useEffect, useState } from 'react'
import { fetchPublicProducts } from '../../../services/public-catalog.service'
import type { PublicProductResult } from '../types/publicProduct'

export type ProductShelfStatus = 'loading' | 'ready' | 'error'

/**
 * First `limit` products of one category, with the category total, for a home
 * shelf. A stale response of a previous slug or attempt never overwrites the
 * current one; `retry` re-runs the request after a failure.
 */
export function usePublicProductShelf(category: string, limit: number) {
  const [status, setStatus] = useState<ProductShelfStatus>('loading')
  const [items, setItems] = useState<PublicProductResult[]>([])
  const [total, setTotal] = useState(0)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setStatus('loading')

    fetchPublicProducts({ category }, 0, limit)
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
  }, [category, limit, attempt])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  return { status, items, total, retry }
}
