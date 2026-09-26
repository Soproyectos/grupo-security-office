import { useCallback, useEffect, useState } from 'react'
import { searchPublicProducts } from '../../../services/public-catalog.service'
import type { PublicProductResult } from '../types/publicProduct'

export type ProductSearchStatus = 'idle' | 'loading' | 'ready' | 'error'

/**
 * Local state of the results page: `idle` without a query, `loading`/`ready`
 * per attempt and `error` on an HTTP failure. The attempt counter is what
 * `retry` bumps, so the same query can be fetched again after a failure.
 */
export function usePublicProductSearch(query: string) {
  const [status, setStatus] = useState<ProductSearchStatus>('idle')
  const [results, setResults] = useState<PublicProductResult[]>([])
  const [attempt, setAttempt] = useState(0)

  const trimmed = query.trim()

  useEffect(() => {
    if (trimmed === '') {
      setStatus('idle')
      setResults([])
      return
    }

    // A stale response of a previous attempt (or of a retried one) must not
    // overwrite the current attempt: the effect is cancelled on cleanup.
    let cancelled = false
    setStatus('loading')
    setResults([])

    searchPublicProducts(trimmed)
      .then((data) => {
        if (cancelled) return
        setStatus('ready')
        setResults(data)
      })
      .catch(() => {
        if (cancelled) return
        setStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [trimmed, attempt])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  return { status, results, retry }
}
