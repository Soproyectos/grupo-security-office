/**
 * Modelo de datos de la ficha de producto.
 * Es el mismo contrato que devuelve el backend en GET /api/public/products/:idOrSlug/detail
 * (ver backend/src/modules/products/public-detail/dto/product-detail.dto.ts).
 */

export type ProductStatus = 'active' | 'discontinued';

export type FeatureIcon =
  | 'shield'
  | 'chip'
  | 'video'
  | 'person'
  | 'audio'
  | 'cloud'
  | 'storage';

export interface BreadcrumbItem {
  label: string;
  href: string;
}

export interface ProductFeature {
  id: string;
  label: string;
  icon: FeatureIcon;
}

export interface SpecItem {
  label: string;
  /** Puede contener saltos de línea (\n); se muestran tal cual. */
  value: string;
}

export interface SpecGroup {
  /** Identificador estable, en kebab-case (p. ej. "video-audio"). */
  id: string;
  title: string;
  items: SpecItem[];
}

export type DocumentType =
  | 'datasheet'
  | 'manual'
  | 'quick-guide'
  | 'certificate'
  | 'other';

export interface ProductDocument {
  id: string;
  type: DocumentType;
  title: string;
  /** Código ISO 639-1: "es", "en"… */
  language: string;
  url: string;
  fileName?: string;
}

export interface FirmwareFile {
  id: string;
  kind: 'firmware' | 'release-notes';
  title: string;
  version?: string;
  region?: string;
  url: string;
  /** Si es true, se muestra el acuerdo de licencia antes de descargar. */
  requiresLicense: boolean;
}

export interface ProductFirmware {
  note?: string;
  files: FirmwareFile[];
  appliesTo: string[];
}

export interface ProductPrice {
  value: number;
  currency: string;
}

export interface ProductImage {
  src: string;
  alt: string;
}

export interface ProductDetail {
  id: string;
  /** Vacío si el producto no tiene slug de catálogo publicado. */
  slug: string;
  /** Precio público (IVA incluido) o null: "Precio a consultar". */
  price: ProductPrice | null;
  /** Ficha oficial visible, pendiente de publicación comercial. */
  isInformational: boolean;
  description: string | null;
  /** Galería, imagen principal primero. */
  images: ProductImage[];
  brand: string;
  model: string;
  name: string;
  status: ProductStatus;
  badges: string[];
  breadcrumb: BreadcrumbItem[];
  image: { src: string; alt: string } | null;
  highlights: string[];
  features: ProductFeature[];
  availableModels: string[];
  specGroups: SpecGroup[];
  specsDisclaimer?: string;
  documents: ProductDocument[];
  firmware: ProductFirmware | null;
}

/** Callback opcional para analítica de descargas (GTM, GA4, etc.). */
export type DownloadHandler = (file: {
  id: string;
  title: string;
  url: string;
  kind: string;
}) => void;
