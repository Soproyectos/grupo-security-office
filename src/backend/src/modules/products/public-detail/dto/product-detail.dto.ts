/**
 * Respuesta de GET /api/public/products/:idOrSlug/detail.
 * Contrato compartido con frontend/src/features/products/types.ts (ProductDetail).
 */
export type FeatureIconDto = 'shield' | 'chip' | 'video' | 'person' | 'audio' | 'cloud' | 'storage';
export type DocumentTypeDto = 'datasheet' | 'manual' | 'quick-guide' | 'certificate' | 'other';

export interface ProductDocumentDto {
  id: string;
  type: DocumentTypeDto;
  title: string;
  language: string;
  url: string;
  fileName?: string;
}

export interface FirmwareFileDto {
  id: string;
  kind: 'firmware' | 'release-notes';
  title: string;
  version?: string;
  region?: string;
  url: string;
  requiresLicense: boolean;
}

export interface ProductDetailDto {
  /** Product id; the sheet is also reachable at `/api/public/products/:id/detail`. */
  id: string;
  /** Empty when the product has no published catalog slug. */
  slug: string;
  /** Public price (same list and rules as `GET /api/public/products/:id`), or null. */
  price: { value: number; currency: string } | null;
  description: string | null;
  /** Gallery, primary image first. */
  images: { src: string; alt: string }[];
  brand: string;
  model: string;
  name: string;
  status: 'active' | 'discontinued';
  badges: string[];
  breadcrumb: { label: string; href: string }[];
  image: { src: string; alt: string } | null;
  highlights: string[];
  features: { id: string; label: string; icon: FeatureIconDto }[];
  availableModels: string[];
  specGroups: { id: string; title: string; items: { label: string; value: string }[] }[];
  specsDisclaimer?: string;
  documents: ProductDocumentDto[];
  firmware: { note?: string; files: FirmwareFileDto[]; appliesTo: string[] } | null;
}