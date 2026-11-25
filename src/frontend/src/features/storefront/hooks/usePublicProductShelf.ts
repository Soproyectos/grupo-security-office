import { useCallback, useEffect, useState } from 'react'
import { fetchPublicProducts } from '../../../services/public-catalog.service'
import type { PublicProductResult } from '../types/publicProduct'

export type ProductShelfStatus = 'loading' | 'ready' | 'error'

export function usePublicProductShelf(category: string, skus: readonly string[]) {
  const [status, setStatus] = useState<ProductShelfStatus>('loading')
  const [items, setItems] = useState<PublicProductResult[]>([])
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setStatus('loading')

    fetchPublicProducts({ category, sku: skus }, 0, skus.length)
      .then((page) => {
        if (cancelled) return
        const bySku = new Map(page.items.filter((item) => !item.isInformational).map((item) => [item.sku, item]))
        const featured = skus.flatMap((sku) => {
          const item = bySku.get(sku)
          return item ? [item] : []
        })
        setItems(featured)
        setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })

    return () => { cancelled = true }
  }, [category, skus, attempt])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])
  return { status, items, total: items.length, retry }
}
