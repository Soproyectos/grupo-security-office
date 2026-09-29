import { useCallback, useEffect, useState } from 'react'
import { fetchPublicProductDetail } from '../../../services/public-catalog.service'
import type { PublicProductDetail } from '../types/publicProduct'

export type ProductDetailStatus = 'loading' | 'ready' | 'not-found' | 'error'

/**
 * State of the public product sheet. `not-found` covers an unpublished or
 * unknown product and a malformed id; `error` is any other failure and can be
 * retried.
 */
export function usePublicProductDetail(id: string) {
  const [status, setStatus] = useState<ProductDetailStatus>('loading')
  const [product, setProduct] = useState<PublicProductDetail | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    setProduct(null)

    fetchPublicProductDetail(id)
      .then((detail) => {
        if (cancelled) return
        setProduct(detail)
        setStatus(detail === null ? 'not-found' : 'ready')
      })
      .catch(() => {
        if (cancelled) return
        setStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [id, attempt])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  return { status, product, retry }
}

export type PublicProductDetailState = ReturnType<typeof usePublicProductDetail>
