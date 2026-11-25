import { Link } from 'react-router-dom'
import { HOME_BRAND_CAMPAIGNS } from '../constants/home-catalog'

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-security-600'

export default function BrandCampaigns({ campaigns = HOME_BRAND_CAMPAIGNS }: { campaigns?: typeof HOME_BRAND_CAMPAIGNS }) {
  if (campaigns.length === 0) return null

  return (
    <section aria-labelledby="home-campaigns-title" className="mx-auto max-w-[80rem] px-5 py-3 sm:px-8 lg:px-10">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-4">
        <div>
          <h2 id="home-campaigns-title" className="text-2xl font-bold">Lo nuevo de Hikvision</h2>
          <p className="mt-1 text-ink-600">Campañas y lanzamientos de la marca, que puedes consultar con nuestro equipo.</p>
        </div>
        <Link to="/catalogo/buscar?brand=hikvision" className={`inline-flex min-h-11 items-center font-bold text-security-600 hover:underline ${FOCUS}`}>
          Ver los productos Hikvision <span aria-hidden="true" className="ml-2 text-xl">›</span>
        </Link>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {campaigns.map(({ id, title, image, alt, href }) => (
          <li key={id}>
            <Link
              to={href}
              className={`group flex h-full flex-col overflow-hidden rounded-card border border-surface-200 hover:border-security-600 ${FOCUS}`}
            >
              <img src={image} alt={alt} width={800} height={800} loading="lazy" className="aspect-square w-full object-cover" />
              <span className="flex min-h-12 items-center justify-between gap-2 px-3 py-2 text-base font-bold text-storefront-ink group-hover:text-security-600">
                {title}
                <span aria-hidden="true" className="text-2xl leading-none text-security-600">›</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
