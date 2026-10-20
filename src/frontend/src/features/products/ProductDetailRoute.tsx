import { Link, useParams } from 'react-router-dom';
import StorefrontChrome from '../storefront/components/StorefrontChrome';
import { useDocumentTitle } from '../storefront/hooks/useDocumentTitle';
import { pageTitle } from '../storefront/utils/documentTitle';
import { useProduct } from './api/useProduct';
import { ProductNotFoundError } from './api/productsApi';
import { ProductDetailPage } from './components/ProductDetailPage';
import { ui } from './styles';

interface ProductDetailRouteProps {
  /** Product id or published slug. Defaults to the `:id` / `:slug` route param. */
  idOrSlug?: string;
  headerOffset?: number;
}

/** Ficha conectada al backend, dentro del chrome de la tienda: carga, error y 404. */
export function ProductDetailRoute({ idOrSlug, headerOffset }: ProductDetailRouteProps) {
  const params = useParams<{ id?: string; slug?: string }>();
  const key = idOrSlug ?? params.id ?? params.slug ?? '';
  const { data, isPending, isError, error, refetch } = useProduct(key);
  const notFound = isError && error instanceof ProductNotFoundError;

  useDocumentTitle(pageTitle(data ? data.name : notFound ? 'Producto no encontrado' : 'Producto'));

  return (
    <StorefrontChrome>
      <main>
        {isPending && <ProductDetailSkeleton />}
        {isError && (
          <div role="alert" className={`${ui.container} py-24 text-center`}>
            <p className="text-5xl font-bold text-red-600">{notFound ? '404' : 'Ups'}</p>
            <h1 className="mt-4 text-xl font-bold text-neutral-950">
              {notFound ? 'Producto no encontrado' : 'No pudimos cargar el producto'}
            </h1>
            <p className="mt-2 text-sm text-neutral-500">
              {notFound ? 'Este producto no existe o ya no está disponible.' : 'Revisa tu conexión e inténtalo de nuevo.'}
            </p>
            <div className="mt-6 flex justify-center gap-3">
              {!notFound && (
                <button type="button" onClick={() => refetch()} className={ui.btnPrimary}>
                  Intentar de nuevo
                </button>
              )}
              <Link to="/catalogo" className={ui.btnOutline}>
                Volver al catálogo
              </Link>
            </div>
          </div>
        )}
        {data && (
          <ProductDetailPage
            product={data}
            headerOffset={headerOffset}
            onDownload={(file) => {
              // Punto para analítica (GTM/GA4), igual que Hikvision registra cada descarga.
              (window as Window & { dataLayer?: unknown[] }).dataLayer?.push({ event: 'file_download', ...file, product: data.id });
            }}
          />
        )}
      </main>
    </StorefrontChrome>
  );
}

export function ProductDetailSkeleton() {
  return (
    <div role="status" className={`${ui.container} animate-pulse py-10`} aria-busy="true">
      <span className="sr-only">Cargando producto…</span>
      <div className="h-3 w-48 rounded bg-neutral-200" />
      <div className="mt-6 grid gap-10 lg:grid-cols-2">
        <div className="aspect-[4/3] rounded-2xl bg-neutral-100" />
        <div className="space-y-4">
          <div className="h-4 w-32 rounded bg-neutral-200" />
          <div className="h-8 w-4/5 rounded bg-neutral-200" />
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-3 w-full rounded bg-neutral-100" />
          ))}
          <div className="flex gap-3 pt-4">
            <div className="h-11 w-48 rounded-full bg-neutral-200" />
            <div className="h-11 w-48 rounded-full bg-neutral-100" />
          </div>
        </div>
      </div>
    </div>
  );
}
