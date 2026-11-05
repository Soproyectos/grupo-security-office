import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { linkKind } from '../utils/campaigns'

interface CampaignLinkProps {
  url: string | null
  className?: string
  onClick?: () => void
  children: ReactNode
}

/** Internal routes via the router, external http(s) in a new tab, otherwise no link. */
export default function CampaignLink({ url, className, onClick, children }: CampaignLinkProps) {
  const kind = linkKind(url)
  if (kind === 'internal' && url) {
    return (
      <Link to={url} className={className} onClick={onClick}>
        {children}
      </Link>
    )
  }
  if (kind === 'external' && url) {
    return (
      <a href={url} target="_blank" rel="noreferrer noopener" className={className} onClick={onClick}>
        {children}
      </a>
    )
  }
  return <div className={className}>{children}</div>
}
