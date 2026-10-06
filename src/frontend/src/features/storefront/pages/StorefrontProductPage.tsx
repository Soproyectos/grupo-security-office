import { Fragment } from 'react'
import { Link, useParams } from 'react-router-dom'
import StorefrontChrome from '../components/StorefrontChrome'
import ProductGallery from '../components/ProductGallery'
import { categoryHref } from '../components/mega-menu/menu-model'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { usePublicProductDetail } from '../hooks/usePublicProductDetail'
import { useStorefrontContact } from '../hooks/useStorefrontContact'
import type { PublicProductDetail } from '../types/publicProduct'
import { pageTitle } from '../utils/documentTitle'
import { formatCop } from '../utils/formatCop'
import { toSentenceCase } from '../utils/toSentenceCase'

const TRUST_ITEMS = ['Distribuidor autorizado', 'Garantía de fábrica', 'Envíos a toda Colombia']

const PRIMARY_BUTTON =
  'inline-flex min-h-11 items-center justify-center rounded-control bg-security-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-security-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-security-500'
const SECONDARY_BUTTON =
  'inline-flex min-h-11 items-center justify-center rounded-control border border-surface-300 bg-white px-5 py-3 text-sm font-bold text-ink-700 transition hover:border-security-500 hover:text-security-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-security-500'

function quoteMessage(product: PublicProductDetail): string {
  return `Hola, quiero cotizar el producto ${product.name} (SKU: ${product.sku}).`
}

function Chevron() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
      <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** Inicio › Catálogo › category ancestors › category › product. */
function Breadcrumb({ product }: { product: PublicProductDetail }) {
  const trail = [...product.breadcrumb, ...(product.category !== null ? [product.category] : [])]

  return (
    <nav aria-label="Ruta de navegación">
      <ol role="list" className="flex flex-wrap items-center gap-1.5 text-body-sm text-ink-500">
        <li>
          <Link to="/tienda" className="transition hover:text-security-500">
            Inicio
          </Link>
        </li>
        <li aria-hidden="true">
          <Chevron />
        </li>
        <li>
          <Link to="/catalogo" className="transition hover:text-security-500">
            Catálogo
          </Link>
        </li>
        {trail.map((category) => (
          <Fragment key={category.id}>
            <li aria-hidden="true">
              <Chevron />
            </li>
            <li>
              <Link to={categoryHref(category.slug)} className="transition hover:text-security-500">
                {category.name}
              </Link>
            </li>
          </Fragment>
        ))}
        <li aria-hidden="true">
          <Chevron />
        </li>
        <li>
          <span aria-current="page" className="font-semibold text-ink-900">
            {product.name}
          </span>
        </li>
      </ol>
    </nav>
  )
}

function PriceBlock({ product }: { product: PublicProductDetail }) {
  if (product.price === null) {
    return (
      <div>
        <p className="font-condensed text-2xl font-bold text-storefront-ink">Precio a consultar</p>
        <p className="text-body-sm text-ink-500">Solicita una cotización y te respondemos por WhatsApp.</p>
      </div>
    )
  }
  return (
    <div>
      <p className="font-condensed text-4xl font-bold leading-tight tabular-nums text-storefront-ink">
        {formatCop(product.price.value)}
      </p>
      <p className="text-body-sm text-ink-500">IVA incluido</p>
    </div>
  )
}

function TrustStrip() {
  return (
    <ul role="list" className="grid gap-2 rounded-card border border-surface-200 bg-surface-50 p-4 text-body-sm text-ink-600">
      {TRUST_ITEMS.map((item) => (
        <li key={item} className="flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0 text-security-500" aria-hidden="true">
            <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {item}
        </li>
      ))}
    </ul>
  )
}

/** Brand, name, SKU, price, CTAs and trust strip; sticky on desktop. */
function Summary({ product }: { product: PublicProductDetail }) {
  const { contact } = useStorefrontContact()
  const whatsapp = contact.whatsappUrl(quoteMessage(product))

  return (
    <div className="flex flex-col gap-5 lg:sticky lg:top-24 lg:self-start">
      {product.brand !== null && <p className="text-eyebrow uppercase text-security-500">{product.brand.name}</p>}
      <h1 className="font-condensed text-2xl font-bold leading-tight text-storefront-ink sm:text-3xl">{product.name}</h1>
      <p className="font-mono text-sm text-ink-500">SKU: {product.sku}</p>
      <PriceBlock product={product} />
      <div className="flex flex-col gap-3 sm:flex-row">
        <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={`${PRIMARY_BUTTON} sm:flex-1`}>
          Cotizar por WhatsApp
        </a>
        <a href={contact.nationalPhoneHref} className={SECONDARY_BUTTON}>
          Llamar
        </a>
      </div>
      <TrustStrip />
    </div>
  )
}

/** Fixed bottom bar of small screens, so the quote CTA is always reachable. */
function MobileBar({ product }: { product: PublicProductDetail }) {
  const { contact } = useStorefrontContact()

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 border-t border-surface-200 bg-white px-4 py-3 lg:hidden">
      <div className="min-w-0 flex-1">
        {product.price !== null ? (
          <>
            <p className="truncate font-condensed text-xl font-bold leading-tight tabular-nums text-storefront-ink">{formatCop(product.price.value)}</p>
            <p className="text-micro text-ink-500">IVA incluido</p>
          </>
        ) : (
          <p className="text-sm font-semibold text-ink-700">Precio a consultar</p>
        )}
      </div>
      <a href={contact.whatsappUrl(quoteMessage(product))} target="_blank" rel="noopener noreferrer" className={PRIMARY_BUTTON}>
        Cotizar por WhatsApp
      </a>
    </div>
  )
}

function Description({ text, brand }: { text: string; brand: string | null }) {
  const readable = toSentenceCase(text, { keep: brand !== null ? [brand] : [] })

  return (
    <section aria-labelledby="producto-descripcion">
      <h2 id="producto-descripcion" className="text-lg font-bold text-ink-900">
        Descripción
      </h2>
      <p className="mt-3 whitespace-pre-line text-body-sm leading-relaxed text-ink-600">{readable}</p>
    </section>
  )
}

function SpecsTable({ specs }: { specs: PublicProductDetail['technicalSpecs'] }) {
  return (
    <section aria-labelledby="producto-especificaciones">
      <h2 id="producto-especificaciones" className="text-lg font-bold text-ink-900">
        Especificaciones técnicas
      </h2>
      <div className="mt-3 overflow-hidden rounded-card border border-surface-200">
        <table className="w-full text-left text-body-sm">
          <tbody>
            {specs.map((spec, index) => (
              <tr key={`${spec.key}-${index}`} className={index % 2 === 0 ? 'bg-surface-50' : 'bg-white'}>
                <th scope="row" className="w-2/5 px-4 py-2.5 font-semibold text-ink-700">
                  {spec.key}
                </th>
                <td className="px-4 py-2.5 text-ink-600">
                  {spec.value}
                  {spec.unit !== null ? ` ${spec.unit}` : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function Datasheets({ datasheets }: { datasheets: PublicProductDetail['datasheets'] }) {
  return (
    <section aria-labelledby="producto-fichas">
      <h2 id="producto-fichas" className="text-lg font-bold text-ink-900">
        Fichas técnicas
      </h2>
      <ul role="list" className="mt-3 flex flex-col gap-2">
        {datasheets.map((sheet, index) => (
          <li key={`${sheet.url}-${index}`}>
            <a
              href={sheet.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-body-sm font-semibold text-security-500 transition hover:text-security-600"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5zM14 3v5h5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {sheet.name}
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}

function ProductSkeleton() {
  return (
    <div role="status" className="grid gap-8 lg:grid-cols-2">
      <span className="sr-only">Cargando producto…</span>
      <span aria-hidden="true" className="aspect-[4/3] w-full animate-pulse rounded-card bg-surface-200" />
      <div aria-hidden="true" className="flex flex-col gap-4">
        <span className="h-3 w-24 animate-pulse rounded bg-surface-100" />
        <span className="h-8 w-4/5 animate-pulse rounded bg-surface-200" />
        <span className="h-4 w-32 animate-pulse rounded bg-surface-100" />
        <span className="h-10 w-48 animate-pulse rounded bg-surface-200" />
        <span className="h-12 w-full animate-pulse rounded bg-surface-100" />
      </div>
    </div>
  )
}

function NotFound() {
  return (
    <section role="alert" className="rounded-card border border-surface-200 bg-white p-8 text-center">
      <h1 className="text-2xl font-bold text-ink-900">Producto no encontrado</h1>
      <p className="mt-2 text-body-sm text-ink-500">Este producto no existe o ya no está disponible.</p>
      <Link to="/catalogo" className={`mt-6 ${PRIMARY_BUTTON}`}>
        Volver al catálogo
      </Link>
    </section>
  )
}

function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <section role="alert" className="rounded-card border border-surface-200 bg-white p-8 text-center">
      <h1 className="text-2xl font-bold text-ink-900">No pudimos cargar el producto</h1>
      <p className="mt-2 text-body-sm text-ink-500">Revisa tu conexión e inténtalo de nuevo.</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={onRetry} className={PRIMARY_BUTTON}>
          Intentar de nuevo
        </button>
        <Link to="/catalogo" className={SECONDARY_BUTTON}>
          Volver al catálogo
        </Link>
      </div>
    </section>
  )
}

/**
 * Public product sheet (`/catalogo/productos/:id`): gallery, public price (IVA
 * incluido) or quote CTA, specs and datasheets. Anonymous visitors only see
 * what `GET /api/public/products/:id` exposes.
 */
export default function StorefrontProductPage() {
  const { id = '' } = useParams<{ id: string }>()
  const { status, product, retry } = usePublicProductDetail(id)
  useDocumentTitle(
    pageTitle(status === 'ready' && product !== null ? product.name : status === 'not-found' ? 'Producto no encontrado' : 'Producto'),
  )

  return (
    <StorefrontChrome>
      <main className="mx-auto max-w-7xl px-5 py-8 pb-28 lg:px-12 lg:pb-12">
        {status === 'loading' && <ProductSkeleton />}
        {status === 'not-found' && <NotFound />}
        {status === 'error' && <LoadError onRetry={retry} />}
        {status === 'ready' && product !== null && (
          <>
            <Breadcrumb product={product} />
            <div className="mt-6 grid gap-8 lg:grid-cols-2 lg:gap-12">
              <ProductGallery
                images={product.images}
                productName={product.name}
                sku={product.sku}
                categorySlug={product.category?.slug ?? null}
              />
              <Summary product={product} />
            </div>
            <div className="mt-12 flex max-w-3xl flex-col gap-10">
              {product.description !== null && product.description !== '' && (
                <Description text={product.description} brand={product.brand?.name ?? null} />
              )}
              {product.technicalSpecs.length > 0 && <SpecsTable specs={product.technicalSpecs} />}
              {product.datasheets.length > 0 && <Datasheets datasheets={product.datasheets} />}
            </div>
            <MobileBar product={product} />
          </>
        )}
      </main>
    </StorefrontChrome>
  )
}
