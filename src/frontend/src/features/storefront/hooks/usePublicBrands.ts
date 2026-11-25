import { useEffect, useState } from 'react'
import { fetchPublicBrands } from '../../../services/public-catalog.service'
import type { PublicBrandSummary } from '../types/publicProduct'

export function usePublicBrands() {
  const [brands, setBrands] = useState<PublicBrandSummary[]>([])
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    fetchPublicBrands()
      .then((result) => { if (active) setBrands(result) })
      .catch(() => { if (active) setError(true) })
    return () => { active = false }
  }, [attempt])

  function retry() {
    setError(false)
    setAttempt((count) => count + 1)
  }

  return { brands, error, retry }
}
