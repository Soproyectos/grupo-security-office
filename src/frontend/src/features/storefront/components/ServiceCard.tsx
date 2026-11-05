import { Link } from 'react-router-dom'

interface ServiceCardBaseProps {
  title: string
  description: string
  actionLabel: string
  /** SVG path data drawn on a 24x24 grid, like the icons in StorefrontHome. */
  iconPath: string
  highlight?: boolean
}

/** Exactly one of `to` (internal route) or `href` (external URL). */
export type ServiceCardProps = ServiceCardBaseProps &
  ({ to: string; href?: never } | { href: string; to?: never })

const ACTION_CLASS =
  'mt-auto inline-flex min-h-11 items-center gap-1 self-start font-bold !text-security-600 hover:underline hover:!text-security-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-security-600'

export default function ServiceCard({ title, description, actionLabel, to, href, iconPath, highlight = false }: ServiceCardProps) {
  const action = (
    <>
      {actionLabel}
      <span aria-hidden="true">›</span>
    </>
  )

  return (
    <article
      className={`flex h-full flex-col rounded-card border bg-white p-6 ${highlight ? 'border-security-600' : 'border-surface-200'}`}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-9 w-9 shrink-0 text-security-600"
      >
        <path d={iconPath} />
      </svg>
      <h2 className="mt-4 text-xl font-bold text-storefront-ink">{title}</h2>
      <p className="mb-4 mt-2 text-ink-600">{description}</p>
      {href ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className={ACTION_CLASS}>
          {action}
        </a>
      ) : (
        <Link to={to as string} className={ACTION_CLASS}>
          {action}
        </Link>
      )}
    </article>
  )
}
