import type { ReactNode } from 'react';
import type { DownloadHandler, ProductDetail } from '../types';
import { ui } from '../styles';
import { previewField } from '../preview/preview-fields';
import { ProductBreadcrumb, ProductHero } from './ProductHero';
import { ProductSubnav, type SubnavSection } from './ProductSubnav';
import { ProductSpecs } from './ProductSpecs';
import { ProductResources } from './ProductResources';
import { ProductJsonLd } from './ProductJsonLd';
import { ProductMobileBar } from './ProductPurchase';
import type { QuoteAction } from '../../storefront/components/AddToQuoteButton';

const SUBNAV_HEIGHT = 56;

interface ProductDetailPageProps {
  product: ProductDetail;
  /** Alto (px) del header fijo del sitio. 0 si el header no es fijo. */
  headerOffset?: number;
  onDownload?: DownloadHandler;
  licenseText?: ReactNode;
  /** Tarifa del cliente con sesión; reemplaza solo lo que se muestra, no los datos estructurados públicos. */
  assignedPrice?: ProductDetail['price'];
  /** Solo para un cliente con cuenta activa: «Agregar a mi cotización». */
  quoteAction?: QuoteAction;
}

/**
 * Ficha de producto: hero + barra fija + Especificaciones + Recursos.
 * Recibe los datos ya cargados; ver ProductDetailRoute para la versión con TanStack Query.
 */
export function ProductDetailPage({
  product,
  headerOffset = 0,
  onDownload,
  licenseText,
  assignedPrice = null,
  quoteAction,
}: ProductDetailPageProps) {
  const sections: SubnavSection[] = [];
  if (product.specGroups.length > 0) sections.push({ id: 'especificaciones', label: 'Especificaciones' });
  if (product.documents.length > 0 || product.firmware?.files.length) sections.push({ id: 'recursos', label: 'Recursos' });

  const stickyTotal = headerOffset + SUBNAV_HEIGHT;
  const sectionStyle = { scrollMarginTop: stickyTotal };

  return (
    <div className="bg-white pb-20 text-neutral-900 antialiased lg:pb-0">
      <ProductJsonLd product={product} />

      {/* Same container and top spacing as the breadcrumb of the catalog pages, so it lines up with the header. */}
      <div className="mx-auto w-full max-w-[105rem] px-5 pt-5 lg:px-12">
        <ProductBreadcrumb items={product.breadcrumb} />
      </div>
      <div className={`${ui.container} pt-3`}>
        <ProductHero product={product} onDownload={onDownload} assignedPrice={assignedPrice} quoteAction={quoteAction} />
      </div>

      {sections.length > 0 && (
        <ProductSubnav
          product={product}
          sections={sections}
          stickyOffset={headerOffset}
          height={SUBNAV_HEIGHT}
          onDownload={onDownload}
        />
      )}

      {product.specGroups.length > 0 && (
        <section id="especificaciones" style={sectionStyle} className="bg-neutral-50/60 py-14 sm:py-20" {...previewField('specs')}>
          <div className={ui.container}>
            <h2 className={`${ui.sectionTitle} mb-10`}>Especificaciones</h2>
            <ProductSpecs
              groups={product.specGroups}
              disclaimer={product.specsDisclaimer}
              stickyTotal={stickyTotal}
            />
          </div>
        </section>
      )}

      {sections.some((s) => s.id === 'recursos') && (
        <section id="recursos" style={sectionStyle} className="py-14 sm:py-20" {...previewField('resources')}>
          <div className={ui.container}>
            <h2 className={`${ui.sectionTitle} mb-10`}>Recursos</h2>
            <ProductResources
              documents={product.documents}
              firmware={product.firmware}
              onDownload={onDownload}
              licenseText={licenseText}
            />
          </div>
        </section>
      )}

      <ProductMobileBar product={product} assignedPrice={assignedPrice} quoteAction={quoteAction} />
    </div>
  );
}