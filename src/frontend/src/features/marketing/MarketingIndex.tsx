import { Link } from 'react-router-dom'
import { Card } from '../../components/ui'
import { MARKETING_PAGES, useMarketingPermissions } from './marketing-access'

/** Home of the panel «Marketing y mercadeo»: one card per page the person can open. */
export default function MarketingIndex() {
  const { permissions } = useMarketingPermissions()
  const pages = MARKETING_PAGES.filter(() => permissions.read)

  return (
    <section aria-labelledby="marketing-pages-title" className="space-y-3">
      <h2 id="marketing-pages-title" className="text-lg font-semibold">Páginas del panel</h2>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {pages.map((page) => (
          <li key={page.to}>
            <Link
              to={page.to}
              className="block h-full rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-focus-ring)]"
            >
              <Card className="h-full space-y-1 transition-shadow hover:shadow-md">
                <p className="text-base font-semibold text-[var(--color-primary)]">{page.label}</p>
                <p className="text-sm text-[var(--color-text-secondary)]">{page.description}</p>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
