import type { ReactNode } from 'react';
import type { DownloadHandler, ProductDetail } from '../types';
import { ui } from '../styles';
import { ProductBreadcrumb, ProductHero } from './ProductHero';
import { ProductSubnav, type SubnavSection } from './ProductSubnav';
import { ProductSpecs } from './ProductSpecs';
import { ProductResources } from './ProductResources';
import { ProductJsonLd } from './ProductJsonLd';
import { ProductMobileBar } from './ProductPurchase';

const SUBNAV_HEIGHT = 56;

interface ProductDetailPageProps {
  product: ProductDetail;
  /** Alto (px) del header fijo del sitio. 0 si el header no es fijo. */
  headerOffset?: number;
  onDownload?: DownloadHandler;
  licenseText?: ReactNode;
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
}: ProductDetailPageProps) {
  const sections: SubnavSection[] = [];
  if (product.specGroups.length > 0) sections.push({ id: 'especificaciones', label: 'Especificaciones' });
  if (product.documents.length > 0 || product.firmware?.files.length) sections.push({ id: 'recursos', label: 'Recursos' });

  const stickyTotal = headerOffset + SUBNAV_HEIGHT;
  const sectionStyle = { scrollMarginTop: stickyTotal };

  return (
    <div className="bg-white pb-20 text-neutral-900 antialiased lg:pb-0">
      <ProductJsonLd product={product} />

      <div className={ui.container}>
        <ProductBreadcrumb items={product.breadcrumb} />
        <ProductHero product={product} onDownload={onDownload} />
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
        <section id="especificaciones" style={sectionStyle} className="bg-neutral-50/60 py-14 sm:py-20">
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
        <section id="recursos" style={sectionStyle} className="py-14 sm:py-20">
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

      <ProductMobileBar product={product} />
    </div>
  );
}