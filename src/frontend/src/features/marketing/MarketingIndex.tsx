import { Navigate } from 'react-router-dom'
import { useMarketingPages } from './marketing-access'

/** `/marketing` has no page of its own: it opens the first tab the person can use. */
export default function MarketingIndex() {
  const { pages } = useMarketingPages()
  const first = pages[0]
  return first ? <Navigate to={first.to} replace /> : null
}
