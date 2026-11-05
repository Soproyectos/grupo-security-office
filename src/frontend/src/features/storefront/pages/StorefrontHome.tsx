import { Link, useNavigate } from 'react-router-dom'
import CampaignPopup from '../components/CampaignPopup'
import HeroBanner from '../components/HeroBanner'
import ProductShelf from '../components/ProductShelf'
import StorefrontChrome from '../components/StorefrontChrome'
import { categoryHref } from '../components/mega-menu/menu-model'
import { BRANCHES } from '../constants/branches'
import { WHATSAPP_MESSAGES, whatsappUrl } from '../constants/contact'
import { HOME_OTHER_CATEGORIES, HOME_SHELVES } from '../constants/home-catalog'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useStorefrontCampaigns } from '../hooks/useStorefrontCampaigns'

const TRUST = [
  { title: 'Distribuidor autorizado', text: 'Hikvision y Ezviz', icon: 'M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6z M9 12l2 2 4-4' },
  { title: 'Soporte sin costo adicional', text: 'Para configurar lo que compras con nosotros', icon: 'M3 13v-2a9 9 0 0 1 18 0v2 M3 13h4v6H5a2 2 0 0 1-2-2z M21 13h-4v6h2a2 2 0 0 0 2-2z M19 19c0 2-3 3-7 3' },
  { title: 'Garantía de 1 año', text: 'En equipos de seguridad electrónica', icon: 'M12 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12z M8.5 14 7 21l5-3 5 3-1.5-7' },
  { title: 'Cuatro sedes', text: 'Pereira, Armenia, Manizales y Cali', icon: 'M12 21s7-5.7 7-11a7 7 0 1 0-14 0c0 5.3 7 11 7 11z M12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z' },
]

const CATEGORY_TILES = [
  { name: 'Cámaras de seguridad', slug: 'camaras', position: '3.7%' },
  { name: 'Alarmas', slug: 'alarmas', position: '35%' },
  { name: 'Control de acceso', slug: 'control-de-acceso', position: '65.3%' },
  { name: 'Cableado y redes', slug: 'cableado', position: '96%' },
]

const BRAND_BANNERS = [
  { src: '/images/home/banner-hikvision-distribuidor.png', alt: 'Hikvision: distribuidor autorizado', query: 'Hikvision' },
  { src: '/images/home/banner-ezviz-nuevas.png', alt: 'Ezviz: cámaras H8X, H80x y H90x', query: 'Ezviz' },
]

const PROTECT = [
  { title: 'Mi casa', hint: 'Vigila, recibe avisos y mira quién llama', slug: 'camaras' },
  { title: 'Mi negocio', hint: 'Cuida la caja, la bodega y la entrada', slug: 'alarmas' },
  { title: 'Mi conjunto o edificio', hint: 'Decide quién entra y quién sale', slug: 'control-de-acceso' },
]

const services = [
  { name: 'Asesoría para proyectos', hint: 'Cotiza tu proyecto', icon: 'm2 12 4-6 4 2 4-1 4-1 4 6-4 4-5 4-7-5z M10 8l-3 4 2 2 4-3 5 5', to: '/servicios/proyectos' },
  { name: 'Soporte técnico', hint: 'Configura o repara tu equipo', icon: 'M3 13v-2a9 9 0 0 1 18 0v2 M3 13h4v6H5a2 2 0 0 1-2-2z M21 13h-4v6h2a2 2 0 0 0 2-2z M19 19c0 2-3 3-7 3', to: '/servicios/soporte' },
  { name: 'Certificaciones', hint: 'Formación para técnicos', icon: 'M19 9a7 7 0 1 1-14 0 7 7 0 0 1 14 0z M9 9l2 2 4-4 M7 14l-2 8 4-2 3 2 3-2 4 2-2-8', to: '/servicios/certificaciones' },
]

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-security-600'

export default function StorefrontHome() {
  useDocumentTitle('Cámaras, alarmas y control de acceso | Grupo Security')
  const navigate = useNavigate()
  const { campaigns } = useStorefrontCampaigns()

  return (
    <StorefrontChrome home>
      <main className="bg-white text-storefront-ink">
        <section className="grid bg-security-600 text-white md:grid-cols-[47%_53%]">
          <div className="flex flex-col justify-center px-5 py-9 sm:px-8 lg:px-12 lg:py-7">
            <h1 className="text-balance text-3xl font-bold leading-tight lg:text-5xl">Protege tu casa o tu negocio</h1>
            <p className="mt-4 max-w-[34rem] text-lg lg:text-xl">
              Equipos Hikvision y Ezviz con asesoría especializada y soporte sin costo adicional.
            </p>
            <form
              action="/catalogo/buscar"
              className="mt-6 flex gap-2"
              onSubmit={(event) => {
                event.preventDefault()
                const query = new FormData(event.currentTarget).get('q')
                if (typeof query === 'string' && query.trim()) {
                  navigate(`/catalogo/buscar?q=${encodeURIComponent(query.trim())}`)
                }
              }}
            >
              <input
                name="q"
                type="search"
                required
                aria-label="Busca por nombre o referencia"
                placeholder="Nombre o referencia"
                className="min-h-14 lg:min-h-12 min-w-0 flex-1 rounded-control bg-white px-4 text-base text-storefront-ink placeholder:text-gray-600 lg:text-lg"
              />
              <button type="submit" className="min-h-14 lg:min-h-12 rounded-control bg-white px-6 text-base font-bold !text-security-600 hover:bg-surface-100 lg:text-lg">
                Buscar
              </button>
            </form>
            <a
              href={whatsappUrl(WHATSAPP_MESSAGES.contact)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex min-h-11 items-center self-start font-bold !text-white underline underline-offset-4 hover:!text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              ¿Prefieres que te asesoremos? Escríbenos por WhatsApp
            </a>
          </div>
          <HeroBanner campaigns={campaigns.hero} />
        </section>
        <CampaignPopup popup={campaigns.popup} />

        <ul aria-label="Por qué comprar con nosotros" className="mx-auto grid max-w-[105rem] gap-x-6 gap-y-3 px-5 py-4 sm:grid-cols-2 sm:px-8 lg:grid-cols-4 lg:px-12">
          {TRUST.map(({ title, text, icon }) => (
            <li key={title} className="flex items-center gap-3 py-1">
              <span aria-hidden="true" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-surface-100">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8 text-security-600">
                  <path d={icon} />
                </svg>
              </span>
              <span className="flex flex-col">
                <span className="font-bold text-storefront-ink">{title}</span>
                <span className="text-sm text-ink-600">{text}</span>
              </span>
            </li>
          ))}
        </ul>

        <section aria-labelledby="home-tiles-title" className="mx-auto max-w-[105rem] px-5 py-4 sm:px-8 lg:px-12">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4">
            <h2 id="home-tiles-title" className="text-2xl font-bold lg:text-3xl">Explora por categoría</h2>
            <Link to="/catalogo" className={`inline-flex min-h-11 items-center font-bold text-security-600 hover:underline ${FOCUS}`}>
              Ver todo el catálogo <span aria-hidden="true" className="ml-2 text-xl">›</span>
            </Link>
          </div>
          <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {CATEGORY_TILES.map(({ name, slug, position }) => (
              <li key={slug}>
                <Link
                  to={categoryHref(slug)}
                  className={`group flex h-full flex-col overflow-hidden rounded-card border border-surface-200 hover:border-security-600 ${FOCUS}`}
                >
                  <div
                    aria-hidden="true"
                    className="aspect-[1.95] bg-no-repeat lg:aspect-[2.2]"
                    style={{
                      backgroundImage: 'url(/images/home/storefront-art.png)',
                      backgroundSize: '440% 488%',
                      backgroundPosition: `${position} 76.4%`,
                    }}
                  />
                  <span className="flex min-h-12 flex-1 items-center justify-between gap-2 bg-surface-100 px-3 py-2 text-base font-bold text-storefront-ink group-hover:text-security-600 lg:text-lg">
                    {name}
                    <span aria-hidden="true" className="text-2xl leading-none text-security-600">›</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section id="soluciones" aria-labelledby="home-protect-title" className="mx-auto max-w-[105rem] px-5 py-4 sm:px-8 lg:px-12">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4">
            <h2 id="home-protect-title" className="text-2xl font-bold lg:text-3xl">¿Qué quieres proteger?</h2>
            <Link to="/soluciones" className={`inline-flex min-h-11 items-center font-bold text-security-600 hover:underline ${FOCUS}`}>
              Ver todas las soluciones <span aria-hidden="true" className="ml-2 text-xl">›</span>
            </Link>
          </div>
          <ul className="grid gap-3 sm:grid-cols-3">
            {PROTECT.map(({ title, hint, slug }) => (
              <li key={title}>
                <Link
                  to={categoryHref(slug)}
                  className={`group flex h-full min-h-20 items-center justify-between gap-3 rounded-card border border-surface-200 bg-surface-100 px-5 py-4 hover:border-security-600 ${FOCUS}`}
                >
                  <span className="flex flex-col">
                    <span className="text-lg font-bold text-storefront-ink group-hover:text-security-600">{title}</span>
                    <span className="text-sm text-ink-600">{hint}</span>
                  </span>
                  <span aria-hidden="true" className="text-2xl leading-none text-security-600">›</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section aria-label="Marcas autorizadas" className="mx-auto max-w-[105rem] px-5 py-6 sm:px-8 lg:px-12">
          <ul className="grid gap-3 md:grid-cols-2">
            {BRAND_BANNERS.map(({ src, alt, query }) => (
              <li key={query}>
                <Link
                  to={`/catalogo/buscar?q=${encodeURIComponent(query)}`}
                  className={`block overflow-hidden rounded-card ${FOCUS}`}
                >
                  <img src={src} alt={alt} width={1500} height={400} loading="lazy" className="h-auto w-full" />
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <div className="mx-auto max-w-[105rem] px-5 pb-6 sm:px-8 lg:px-12">
          {HOME_SHELVES.map((shelf) => (
            <ProductShelf key={shelf.slug} shelf={shelf} />
          ))}
        </div>

        <section aria-labelledby="home-more-title" className="mx-auto max-w-[105rem] px-5 pb-10 sm:px-8 lg:px-12">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4">
            <h2 id="home-more-title" className="text-2xl font-bold lg:text-3xl">Más categorías</h2>
            <Link to="/catalogo" className={`inline-flex min-h-11 items-center font-bold text-security-600 hover:underline ${FOCUS}`}>
              Ver todo el catálogo <span aria-hidden="true" className="ml-2 text-xl">›</span>
            </Link>
          </div>
          <ul className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-5">
            {HOME_OTHER_CATEGORIES.map(({ slug, title }) => (
              <li key={slug}>
                <Link
                  to={categoryHref(slug)}
                  className={`flex min-h-14 items-center justify-between gap-2 rounded-card border border-surface-200 px-4 py-2 font-bold text-storefront-ink hover:border-security-600 hover:text-security-600 ${FOCUS}`}
                >
                  {title}
                  <span aria-hidden="true" className="text-xl leading-none text-security-600">›</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <div className="border-y border-surface-200 bg-white">
          <nav id="contacto-tienda" aria-label="Servicios" className="mx-auto grid max-w-[105rem] px-5 py-1 sm:grid-cols-3 sm:divide-x sm:divide-surface-300 sm:px-8 lg:px-12">
            {services.map(({ name, hint, to, icon }) => (
              <Link key={name} to={to} className="group flex min-h-14 items-center gap-4 px-2 py-2 sm:justify-center">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-9 w-9 shrink-0 text-security-600">
                  <path d={icon} />
                </svg>
                <span className="flex flex-col text-left">
                  <span className="font-bold !text-storefront-ink group-hover:!text-security-600 group-hover:underline">{name}</span>
                  <span className="text-sm !text-storefront-ink/80">{hint}</span>
                </span>
              </Link>
            ))}
          </nav>
        </div>

        <section aria-labelledby="home-branches-title" className="mx-auto flex max-w-[105rem] flex-col gap-4 px-5 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-12">
          <div>
            <h2 id="home-branches-title" className="text-2xl font-bold">Visítanos o escríbenos</h2>
            <p className="mt-1 text-ink-600">
              Estamos en {BRANCHES.map((branch) => branch.city).join(', ')}. Te asesoramos en la sede o por WhatsApp.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link to="/sedes" className={`inline-flex min-h-12 items-center justify-center rounded-control border border-security-600 px-6 font-bold !text-security-600 hover:underline hover:!text-security-600 ${FOCUS}`}>
              Ver las sedes
            </Link>
            <a
              href={whatsappUrl(WHATSAPP_MESSAGES.contact)}
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex min-h-12 items-center justify-center rounded-control bg-security-600 px-6 font-bold !text-white hover:underline hover:!text-white ${FOCUS}`}
            >
              Escribir por WhatsApp
            </a>
          </div>
        </section>
      </main>
    </StorefrontChrome>
  )
}
