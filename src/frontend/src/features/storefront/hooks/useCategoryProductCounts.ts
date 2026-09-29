import { useEffect, useMemo, useState } from 'react'
import { fetchPublicProducts } from '../../../services/public-catalog.service'
import type { MenuCategory } from '../types/categoryMenu'
import { pickCountedCategories, type CountedCategory } from '../utils/pickCountedCategories'

export type CategoryCountsStatus = 'loading' | 'ready' | 'error'

/** Requests in flight at once: the home probes one category per menu root. */
const CONCURRENCY = 6

/**
 * Counts already fetched in this session, so coming back to the home does not
 * repeat one request per category. Deliberately in memory only: stock changes.
 */
const sessionCounts = new Map<string, number>()

async function countProducts(slug: string): Promise<number | null> {
  const cached = sessionCounts.get(slug)
  if (cached !== undefined) return cached

  try {
    const page = await fetchPublicProducts({ category: slug }, 0, 1)
    sessionCounts.set(slug, page.total)
    return page.total
  } catch {
    return null
  }
}

/**
 * Live product count of each candidate category (`meta.total` of a `limit=1`
 * request), reduced to the categories that hold products. It is `error` only
 * when every request failed; a partial failure just leaves those categories out.
 */
export function useCategoryProductCounts(candidates: MenuCategory[], cap: number) {
  const slugKey = candidates.map((category) => category.slug).join('|')
  const [counts, setCounts] = useState<ReadonlyMap<string, number>>(new Map())
  const [status, setStatus] = useState<CategoryCountsStatus>('loading')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const slugs = slugKey === '' ? [] : slugKey.split('|')
    if (slugs.length === 0) {
      setCounts(new Map())
      setStatus('ready')
      return
    }

    let cancelled = false
    setStatus('loading')
    const found = new Map<string, number>()
    let failures = 0
    let cursor = 0

    const worker = async () => {
      while (!cancelled && cursor < slugs.length) {
        const slug = slugs[cursor]
        cursor += 1
        if (slug === undefined) return
        const total = await countProducts(slug)
        if (total === null) failures += 1
        else found.set(slug, total)
      }
    }

    void Promise.all(Array.from({ length: Math.min(CONCURRENCY, slugs.length) }, worker)).then(() => {
      if (cancelled) return
      setCounts(found)
      setStatus(failures === slugs.length ? 'error' : 'ready')
    })

    return () => {
      cancelled = true
    }
  }, [slugKey, attempt])

  const entries: CountedCategory[] = useMemo(
    () => pickCountedCategories(candidates, counts, cap),
    [candidates, counts, cap],
  )

  return { status, entries, retry: () => setAttempt((n) => n + 1) }
}
