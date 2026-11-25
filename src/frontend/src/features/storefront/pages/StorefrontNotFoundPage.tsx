import { Link } from 'react-router-dom'
import StorefrontChrome from '../components/StorefrontChrome'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { pageTitle } from '../utils/documentTitle'

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-security-500'

export default function StorefrontNotFoundPage() {
  useDocumentTitle(pageTitle('Página no encontrada'))

  return (
    <StorefrontChrome>
      <main aria-labelledby="page-not-found-heading" className="mx-auto max-w-2xl px-5 py-20 text-center sm:px-8 sm:py-28">
        <h1 id="page-not-found-heading" className="text-3xl font-bold text-ink-900 sm:text-4xl">
          No encontramos esta página
        </h1>
        <p className="mt-4 text-base leading-relaxed text-ink-700">
          El enlace puede estar incompleto o haber cambiado.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link
            to="/catalogo"
            className={`inline-flex min-h-11 items-center justify-center rounded-control bg-security-500 px-5 py-3 text-sm font-bold !text-white hover:bg-security-600 ${FOCUS}`}
          >
            Volver al catálogo
          </Link>
          <Link
            to="/tienda"
            className={`inline-flex min-h-11 items-center justify-center rounded-control border border-surface-300 px-5 py-3 text-sm font-bold !text-ink-800 hover:bg-surface-100 ${FOCUS}`}
          >
            Ir a la tienda
          </Link>
        </div>
      </main>
    </StorefrontChrome>
  )
}
