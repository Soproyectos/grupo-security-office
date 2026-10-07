import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toSentenceCase } from '../../storefront/utils/toSentenceCase';
import { productImageSrc } from '../lib/image-src';
import type { DownloadHandler, ProductDetail } from '../types';
import { cx } from '../styles';
import { ChevronRightIcon, DownloadIcon, FeatureGlyph, HomeIcon } from './icons';
import { ProductCtas, ProductPriceBlock, ProductTrustStrip } from './ProductPurchase';

interface ProductHeroProps {
  product: ProductDetail;
  onDownload?: DownloadHandler;
}

/**
 * Trail down to the product's category. The product itself is not repeated: its name is
 * already the page title, so the last crumb is the category (a link back to its listing).
 */
export function ProductBreadcrumb({ items }: { items: ProductDetail['breadcrumb'] }) {
  return (
    <nav aria-label="Ruta de navegación" className="py-4">
      <ol className="flex flex-wrap items-center gap-1.5 text-xs text-neutral-500">
        <li>
          <Link to="/tienda" className="inline-flex items-center hover:text-red-600" aria-label="Inicio">
            <HomeIcon className="h-4 w-4" />
          </Link>
        </li>
        {items.map((item) => (
          <li key={item.href} className="inline-flex items-center gap-1.5">
            <ChevronRightIcon className="h-3.5 w-3.5 text-neutral-400" />
            <Link to={item.href} className="hover:text-red-600">
              {item.label}
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function ProductGallery({ images, name }: { images: ProductDetail['images']; name: string }) {
  const [selected, setSelected] = useState(0);
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const current = images[selected] ?? images[0];

  return (
    <figure className="flex flex-col gap-3">
      <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-b from-neutral-50 to-neutral-100 p-8">
        {current && !failed.has(current.src) ? (
          <img
            src={productImageSrc(current.src)}
            alt={current.alt || name}
            className="max-h-full w-auto object-contain"
            decoding="async"
            onError={() => setFailed((prev) => new Set(prev).add(current.src))}
          />
        ) : (
          <span className="text-sm text-neutral-400">Imagen no disponible</span>
        )}
      </div>
      {images.length > 1 && (
        <ul aria-label="Imágenes del producto" className="flex flex-wrap gap-2">
          {images.map((image, index) => (
            <li key={image.src}>
              <button
                type="button"
                onClick={() => setSelected(index)}
                aria-label={`Ver imagen ${index + 1} de ${images.length}`}
                aria-current={index === selected}
                className={cx(
                  'h-16 w-16 overflow-hidden rounded-lg border bg-white transition-colors',
                  index === selected ? 'border-red-600' : 'border-neutral-200 hover:border-neutral-400',
                )}
              >
                <img
                  src={productImageSrc(image.src)}
                  alt=""
                  width={64}
                  height={64}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                />
              </button>
            </li>
          ))}
        </ul>
      )}
      <figcaption className="text-center text-[11px] leading-snug text-neutral-400">
        Imágenes de referencia. El aspecto y las especificaciones del producto real pueden variar.
      </figcaption>
    </figure>
  );
}

export function ProductHero({ product, onDownload }: ProductHeroProps) {
  const datasheet = product.documents.find((d) => d.type === 'datasheet');
  const description = product.description?.trim();

  /*
   * One DOM copy, two layouts. Mobile order: gallery, title and purchase, chips and trust.
   * From lg up the gallery and the supporting block share the left column, so it is as tall
   * as the right one instead of leaving an empty gap below the gallery.
   */
  return (
    <section className="grid gap-8 pb-12 lg:grid-cols-2 lg:grid-rows-[auto_1fr] lg:items-start lg:gap-x-14 lg:gap-y-6 lg:pb-16">
      <div className="lg:col-start-1 lg:row-start-1">
        <ProductGallery images={product.images.length > 0 ? product.images : product.image ? [product.image] : []} name={product.name} />
      </div>

      <div className="flex flex-col gap-5 lg:col-start-2 lg:row-span-2 lg:row-start-1">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold tracking-wide text-neutral-950">SKU: {product.model}</span>
            {product.badges.map((badge) => (
              <span
                key={badge}
                className="rounded-sm bg-red-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white"
              >
                {badge}
              </span>
            ))}
            {product.status === 'discontinued' && (
              <span className="rounded-sm bg-neutral-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-neutral-600">
                Descontinuado
              </span>
            )}
          </div>

          <h1 className="mt-3 text-2xl font-bold leading-tight tracking-tight text-neutral-950 sm:text-3xl">
            {product.name}
          </h1>
          {product.brand && <p className="mt-1 text-sm text-neutral-500">Marca: {product.brand}</p>}
        </div>

        <ProductPriceBlock price={product.price} />

        {product.highlights.length > 0 ? (
          <ul className="space-y-2.5">
            {product.highlights.map((text) => (
              <li key={text} className="flex gap-3 text-[15px] leading-relaxed text-neutral-700">
                <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-600" aria-hidden="true" />
                {text}
              </li>
            ))}
          </ul>
        ) : (
          description && (
            <p className="whitespace-pre-line text-[15px] leading-relaxed text-neutral-700">
              {toSentenceCase(description, { keep: product.brand ? [product.brand] : [] })}
            </p>
          )
        )}

        <ProductCtas product={product} />

        {datasheet && (
          <a
            href={datasheet.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm font-semibold text-red-600 hover:text-red-700"
            onClick={() =>
              onDownload?.({ id: datasheet.id, title: datasheet.title, url: datasheet.url, kind: datasheet.type })
            }
          >
            <DownloadIcon className="h-4 w-4" />
            Ficha técnica
          </a>
        )}

        {product.availableModels.length > 0 && (
          <div className="border-t border-neutral-200 pt-5">
            <p className="text-sm font-semibold text-neutral-950">Modelos disponibles</p>
            <p className="mt-1 text-sm text-neutral-600">{product.availableModels.join(', ')}</p>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-5 lg:col-start-1 lg:row-start-2">
        {product.features.length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label="Tecnologías destacadas">
            {product.features.map((f) => (
              <li
                key={f.id}
                className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50/60 px-3 py-2 text-xs font-medium text-neutral-800"
              >
                <FeatureGlyph icon={f.icon} className="h-4 w-4 text-red-600" />
                {f.label}
              </li>
            ))}
          </ul>
        )}

        <ProductTrustStrip />
      </div>
    </section>
  );
}
