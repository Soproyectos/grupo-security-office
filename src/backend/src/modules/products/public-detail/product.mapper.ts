import type { PublicProductDetail } from '../public-catalog.service';
import type {
  DocumentTypeDto,
  FirmwareFileDto,
  ProductDetailDto,
  ProductDocumentDto,
} from './dto/product-detail.dto';

/** Forma del registro que devuelve Prisma con `productDetailInclude`. */
export type ResourceKind =
  | 'DATASHEET'
  | 'MANUAL'
  | 'QUICK_GUIDE'
  | 'CERTIFICATE'
  | 'OTHER_DOCUMENT'
  | 'FIRMWARE'
  | 'RELEASE_NOTES';

export interface ProductRecord {
  catalogSlug: string | null;
  catalogBrand: string | null;
  catalogModel: string | null;
  catalogName: string | null;
  catalogStatus: 'ACTIVE' | 'DISCONTINUED' | null;
  catalogPublished: boolean;
  catalogBadges: string[];
  catalogImageUrl: string | null;
  catalogImageAlt: string | null;
  catalogHighlights: string[];
  catalogFeatures: unknown;
  catalogAvailableModels: string[];
  catalogBreadcrumb: unknown;
  catalogSpecsDisclaimer: string | null;
  catalogFirmwareNote: string | null;
  catalogSpecGroups: { key: string; title: string; items: { label: string; value: string }[] }[];
  catalogResources: {
    id: string;
    kind: ResourceKind;
    title: string;
    language: string;
    url: string;
    fileName: string | null;
    version: string | null;
    region: string | null;
    requiresLicense: boolean;
  }[];
}

const DOCUMENT_TYPES: Partial<Record<ResourceKind, DocumentTypeDto>> = {
  DATASHEET: 'datasheet',
  MANUAL: 'manual',
  QUICK_GUIDE: 'quick-guide',
  CERTIFICATE: 'certificate',
  OTHER_DOCUMENT: 'other',
};

const opt = <T>(value: T | null): T | undefined => value ?? undefined;

const nonEmpty = (value: string | null | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

function toBreadcrumb(p: ProductRecord, base: PublicProductDetail): ProductDetailDto['breadcrumb'] {
  if (Array.isArray(p.catalogBreadcrumb) && p.catalogBreadcrumb.length > 0) {
    return p.catalogBreadcrumb as ProductDetailDto['breadcrumb'];
  }
  const trail = [...base.breadcrumb, ...(base.category ? [base.category] : [])];
  return [
    { label: 'Catálogo', href: '/catalogo' },
    ...trail.map((c) => ({ label: c.name, href: `/catalogo/categoria/${c.slug}` })),
  ];
}

/**
 * Builds the sheet of a public product. `base` is the public view of the product
 * (visibility, price, images, category trail, technical specs, datasheets) and
 * `p` holds the optional enriched catalog data: enriched fields win, base data
 * fills the gaps.
 */
export function toProductDetailDto(p: ProductRecord, base: PublicProductDetail): ProductDetailDto {
  const documents: ProductDocumentDto[] = [];
  const firmwareFiles: FirmwareFileDto[] = [];

  for (const r of p.catalogResources) {
    const docType = DOCUMENT_TYPES[r.kind];
    if (docType) {
      documents.push({
        id: r.id,
        type: docType,
        title: r.title,
        language: r.language,
        url: r.url,
        fileName: opt(r.fileName),
      });
    } else {
      firmwareFiles.push({
        id: r.id,
        kind: r.kind === 'FIRMWARE' ? 'firmware' : 'release-notes',
        title: r.title,
        version: opt(r.version),
        region: opt(r.region),
        url: r.url,
        requiresLicense: r.requiresLicense,
      });
    }
  }

  if (documents.length === 0) {
    base.datasheets.forEach((d, index) => {
      documents.push({ id: `datasheet-${index}`, type: 'datasheet', title: d.name, language: 'es', url: d.url });
    });
  }

  const name = nonEmpty(p.catalogName) ?? base.name;

  const specGroups: ProductDetailDto['specGroups'] =
    p.catalogSpecGroups.length > 0
      ? p.catalogSpecGroups.map((g) => ({
          id: g.key,
          title: g.title,
          items: g.items.map((i) => ({ label: i.label, value: i.value })),
        }))
      : base.technicalSpecs.length > 0
        ? [
            {
              id: 'especificaciones-tecnicas',
              title: 'Especificaciones técnicas',
              items: base.technicalSpecs.map((s) => ({
                label: s.key,
                value: s.unit ? `${s.value} ${s.unit}` : s.value,
              })),
            },
          ]
        : [];

  const gallery: ProductDetailDto['images'] = [];
  const addImage = (src: string, alt: string) => {
    if (src && !gallery.some((g) => g.src === src)) gallery.push({ src, alt });
  };
  if (p.catalogImageUrl) addImage(p.catalogImageUrl, p.catalogImageAlt ?? name);
  base.images.forEach((i) => addImage(i.url, i.alt ?? name));

  return {
    id: base.id,
    slug: p.catalogSlug ?? '',
    price: base.price,
    description: base.description,
    brand: nonEmpty(p.catalogBrand) ?? base.brand?.name ?? '',
    model: nonEmpty(p.catalogModel) ?? base.sku,
    name,
    status: p.catalogStatus === 'DISCONTINUED' ? 'discontinued' : 'active',
    badges: p.catalogBadges,
    breadcrumb: toBreadcrumb(p, base),
    image: gallery[0] ?? null,
    images: gallery,
    highlights: p.catalogHighlights,
    features: Array.isArray(p.catalogFeatures) ? (p.catalogFeatures as ProductDetailDto['features']) : [],
    availableModels: p.catalogAvailableModels,
    specGroups,
    specsDisclaimer: opt(p.catalogSpecsDisclaimer),
    documents,
    firmware: firmwareFiles.length
      ? { note: opt(p.catalogFirmwareNote), files: firmwareFiles, appliesTo: p.catalogAvailableModels }
      : null,
  };
}

/** Relaciones necesarias para armar la ficha, ya ordenadas. */
export const productDetailInclude = {
  catalogSpecGroups: {
    orderBy: { position: 'asc' as const },
    include: { items: { orderBy: { position: 'asc' as const } } },
  },
  catalogResources: { orderBy: { position: 'asc' as const } },
} as const;