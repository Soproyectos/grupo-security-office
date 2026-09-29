import { Link } from 'react-router-dom'
import { HOME_BRANDS, brandSearchHref, type HomeBrand } from '../constants/home-catalog'

/** Brands the store carries, as text chips that open the catalog search. */
export default function BrandsStrip({ brands = HOME_BRANDS }: { brands?: HomeBrand[] }) {
  return (
    <section aria-labelledby="home-marcas-title" className="mt-12">
      <h2 id="home-marcas-title" className="font-condensed text-2xl font-bold text-storefront-ink">
        Marcas que distribuimos
      </h2>
      <ul role="list" className="mt-4 flex flex-wrap gap-3">
        {brands.map((brand) => (
          <li key={brand.label}>
            <Link
              to={brandSearchHref(brand)}
              className="inline-flex min-h-11 items-center rounded-full border border-surface-300 bg-white px-5 font-condensed text-base font-bold text-storefront-ink transition-colors duration-150 hover:border-storefront-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-security-500"
            >
              {brand.label}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
