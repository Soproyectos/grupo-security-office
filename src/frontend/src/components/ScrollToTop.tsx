import { useEffect, useRef } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'
import { shouldScrollToTop } from './scroll-to-top'

export default function ScrollToTop() {
  const { pathname, hash } = useLocation()
  const navigationType = useNavigationType()
  const previousPath = useRef<string | null>(null)

  useEffect(() => {
    if (shouldScrollToTop({ navigationType, previousPath: previousPath.current, path: pathname, hash })) {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    }
    previousPath.current = pathname
  }, [pathname, hash, navigationType])

  return null
}
