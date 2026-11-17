import { BadRequestException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { Prisma as OperationalPrisma } from '@prisma/client';
import { BibliotecaPrismaService } from '../../prisma/biblioteca-prisma.service';
import { directLegacyProductLibrary } from './product-library';
import { PrismaService } from '../../prisma/prisma.service';
import {
  buildBreadcrumb,
  collectCategoryIds,
  PublicCategoryRef,
  PublicDatasheet,
  PublicTechnicalSpec,
  sanitizeDatasheets,
  sanitizeTechnicalSpecs,
} from './public-catalog.helpers';
import { PublicPrice, PublicPricingService } from './public-pricing.service';
import { Prisma } from '../../../prisma/biblioteca/generated/client';
import { publicCatalogVisibility } from './public-catalog-visibility';
import { PublishedKeySpecsService, type KeySpecFacetsView } from '../library-specs/published-key-specs.service';
import { parseKeySpecFilter } from '../library-specs/published-key-specs.rules';
import { applyRevisionLens, effectiveIdentity, loadActiveRevisionContents } from './public-revision-lens';
import { buildProductSearchSql, looksLikeCode } from './helpers/product-search';

/** Product found by the public text search: relevance rank (0 exact … 3 words) and its published name. */
interface SnapshotMatch {
  id: string;
  rank: number;
  name: string;
}

/** Fila del listado público: solo campos aptos para un visitante anónimo. */
export interface PublicProductListItem {
  id: string;
  sku: string;
  name: string;
  imageUrl: string | null;
  categoryName: string;
  categorySlug: string;
  brandName: string;
  /** True while the official library record has not passed commercial publication. */
  isInformational: boolean;
  /** Precio de la lista pública vigente, o `null` si el producto no lo tiene. */
  price: PublicPrice | null;
}

export interface PublicProductListResponse {
  data: PublicProductListItem[];
  meta: { total: number; offset: number; limit: number };
}

export interface PublicProductDetail {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  brand: { name: string; slug: string } | null;
  category: PublicCategoryRef | null;
  /** Ancestros de la categoría, raíz primero, sin incluir la categoría misma. */
  breadcrumb: PublicCategoryRef[];
  /** La imagen principal va primero. */
  images: Array<{ url: string; alt: string | null }>;
  technicalSpecs: PublicTechnicalSpec[];
  datasheets: PublicDatasheet[];
  price: PublicPrice | null;
  /** True while the official library record has not passed commercial publication. */
  isInformational: boolean;
}

export const PUBLIC_LIST_DEFAULT_LIMIT = 24;

type PublishedCategory = { name: string; slug: string; id?: string; parentId?: string | null };
type PublishedBrand = { name: string; slug?: string };

/**
 * Lectura pública del catálogo para el storefront. Todas las consultas usan un
 * `select` explícito (nunca se propaga una fila de producto) y solo devuelven
 * productos comercialmente publicados o fichas informativas del lote oficial.
 * Los precios llegan exclusivamente de `PublicPricingService`.
 */
@Injectable()
export class PublicCatalogService {
  constructor(
    prisma: PrismaService,
    private readonly pricing: PublicPricingService,
    @Inject(BibliotecaPrismaService) private readonly library: BibliotecaPrismaService = directLegacyProductLibrary(prisma),
    @Optional() private readonly keySpecs?: PublishedKeySpecsService,
  ) {}

  private get prisma() { return this.library.client; }

  private async visibility<TJsonNull>(jsonNull: TJsonNull) {
    return publicCatalogVisibility(jsonNull);
  }

  /**
   * Listado/búsqueda pública paginada (HOM-02 + categorías): publicados por
   * nombre o SKU (`q`) y/o por categoría (`category` = slug, incluye sus
   * descendientes). Un slug de categoría desconocido (o inactivo) devuelve una
   * lista vacía, no un error. Orden estable: nombre y luego id. El modelo
   * Product no tiene slug propio; cada fila enlaza a su categoría por slug.
   */
  async search(params: {
    q?: string;
    category?: string;
    /** Repeated `<specKey>:<value>` filters on PUBLISHED key specs; all must match. */
    keySpec?: string[];
    offset?: number;
    limit?: number;
  }): Promise<PublicProductListResponse> {
    const term = params.q?.trim() ?? '';
    const categorySlug = params.category?.trim() ?? '';
    const limit = params.limit ?? PUBLIC_LIST_DEFAULT_LIMIT;
    const offset = params.offset ?? 0;
    const empty: PublicProductListResponse = { data: [], meta: { total: 0, offset, limit } };

    let categoryIds: string[] | undefined;
    if (categorySlug !== '') {
      const categories = await this.prisma.category.findMany({
        select: { id: true, slug: true, parentId: true, isActive: true },
      });
      categoryIds = collectCategoryIds(categories, categorySlug);
      if (categoryIds.length === 0) return empty;
    }

    // Key-spec filters narrow by id; visibility below stays the one public rule.
    let keySpecIds: string[] | undefined;
    if (params.keySpec?.length) {
      if (!this.keySpecs) throw new Error('Key-spec filters need PublishedKeySpecsService');
      const filters = params.keySpec.map((raw) => {
        const f = parseKeySpecFilter(raw);
        if (!f) throw new BadRequestException('keySpec debe tener la forma <dato>:<valor>');
        return f;
      });
      keySpecIds = await this.keySpecs.matchingProductIds(filters);
      if (keySpecIds.length === 0) return empty;
    }

    // Published-isolation: text search and category filter match the PUBLISHED snapshot
    // (live columns only when the revision lacks the key / the product has no pinned revision).
    let snapshotIds: string[] | undefined;
    let ranks: Map<string, SnapshotMatch> | undefined;
    if (term !== '' || categoryIds) {
      const matches = await this.snapshotMatches(term, categoryIds);
      if (matches.length === 0) return empty;
      snapshotIds = matches.map((m) => m.id);
      // With a text term the order is relevance (exact > starts with > contains > words), then name.
      if (term !== '') ranks = new Map(matches.map((m) => [m.id, m]));
    }

    const where = {
      AND: [
        await this.visibility(Prisma.JsonNull),
        ...(keySpecIds ? [{ id: { in: keySpecIds } }] : []),
        ...(snapshotIds ? [{ id: { in: snapshotIds } }] : []),
      ],
    };

    const select = {
      id: true,
      sku: true,
      name: true,
      lifecycleStatus: true,
      publicRevisionId: true,
      categoryId: true,
      brandId: true,
      category: { select: { name: true, slug: true } },
      brand: { select: { name: true } },
      images: {
        where: { isPrimary: true },
        select: { url: true },
        take: 1,
        orderBy: { sortOrder: 'asc' },
      },
    } satisfies Prisma.ProductSelect;

    let products: Array<Prisma.ProductGetPayload<{ select: typeof select }>>;
    let total: number;
    if (ranks) {
      // Visibility stays the one public rule; the page is cut AFTER ordering by relevance.
      const visible = await this.prisma.product.findMany({ where, select: { id: true } });
      const order = visible.map((row) => row.id).sort((x, y) => {
        const a = ranks.get(x)!;
        const b = ranks.get(y)!;
        return a.rank - b.rank || a.name.localeCompare(b.name) || x.localeCompare(y);
      });
      total = order.length;
      const pageIds = order.slice(offset, offset + limit);
      const pageRows = pageIds.length
        ? await this.prisma.product.findMany({ where: { id: { in: pageIds } }, select })
        : [];
      const position = new Map(pageIds.map((id, index) => [id, index]));
      products = pageRows.sort((x, y) => position.get(x.id)! - position.get(y.id)!);
    } else {
      [products, total] = await Promise.all([
        this.prisma.product.findMany({
          where,
          select,
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
          skip: offset,
          take: limit,
        }),
        this.prisma.product.count({ where }),
      ]);
    }

    const prices = await this.pricing.getPublicPrices(
      products.filter((p) => p.lifecycleStatus === 'PUBLISHED').map((p) => p.id),
    );

    // CAT-02: the list serves the active snapshot when there is one (live columns as fallback).
    const contents = await loadActiveRevisionContents(this.prisma, products.map((p) => p.publicRevisionId));

    const refs = await this.publishedRefs(products, contents);

    return {
      data: products.map((raw) => {
        const p = applyRevisionLens(raw, contents);
        const ref = refs(raw);
        return {
          id: p.id,
          sku: p.sku,
          name: p.name,
          imageUrl: ([...p.images].sort((x, y) => Number(Boolean((y as { isPrimary?: boolean }).isPrimary)) - Number(Boolean((x as { isPrimary?: boolean }).isPrimary))))[0]?.url ?? null,
          categoryName: ref.category?.name ?? null,
          categorySlug: ref.category?.slug ?? null,
          brandName: ref.brand?.name ?? null,
          isInformational: p.lifecycleStatus !== 'PUBLISHED',
          price: p.lifecycleStatus === 'PUBLISHED' ? (prices.get(p.id) ?? null) : null,
        };
      }),
      meta: { total, offset, limit },
    };
  }

  /**
   * Ficha pública de un producto. Un id inexistente y un borrador ajeno al lote
   * oficial responden igual (404) para no revelar el estado interno.
   */
  async getDetail(id: string, opts: { skipVisibility?: boolean } = {}): Promise<PublicProductDetail> {
    const product = await this.prisma.product.findFirst({
      where: { id, ...(opts.skipVisibility ? {} : { AND: [await this.visibility(Prisma.JsonNull)] }) },
      select: {
        id: true,
        sku: true,
        name: true,
        lifecycleStatus: true,
        publicRevisionId: true,
        description: true,
        categoryId: true,
        brandId: true,
        technicalSpecs: true,
        documents: true,
        brand: { select: { name: true, slug: true } },
        category: { select: { id: true, name: true, slug: true, parentId: true } },
        images: {
          select: { url: true, alt: true, isPrimary: true, sortOrder: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
    if (!product) throw new NotFoundException('Producto no encontrado');

    // CAT-02: el snapshot activo pisa la ficha; columnas vivas = fallback (K4).
    const contents = await loadActiveRevisionContents(this.prisma, [product.publicRevisionId]);
    const lensed = applyRevisionLens(product, contents, { preview: Boolean(opts.skipVisibility) });

    // Published-isolation: public brand/category/breadcrumb come from the PUBLISHED snapshot;
    // the admin preview (skipVisibility) shows the live rows.
    const ref: { category: PublishedCategory | null; brand: PublishedBrand | null } = opts.skipVisibility
      ? { category: product.category, brand: product.brand }
      : (await this.publishedRefs([product], contents))(product);
    const [price, breadcrumb] = await Promise.all([
      this.pricing.getPublicPrice(product.id),
      this.breadcrumbOf(ref.category?.parentId ?? null),
    ]);

    // Published-isolation: the public gallery is the PUBLISHED snapshot (same as the list);
    // the admin preview (skipVisibility) shows the live/draft rows. A revision without
    // `images` (legacy) keeps the live rows.
    const source = !opts.skipVisibility && Array.isArray((lensed as { images?: unknown }).images)
      ? ((lensed as unknown as { images: typeof product.images }).images)
      : product.images;
    // Primaria primero; el resto conserva el orden por sortOrder de la consulta.
    const images = [...source].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));

    return {
      id: lensed.id,
      sku: lensed.sku,
      name: lensed.name,
      description: lensed.description ?? null,
      brand: ref.brand ? { name: ref.brand.name, slug: ref.brand.slug } : null,
      category: ref.category ? { name: ref.category.name, slug: ref.category.slug } : null,
      breadcrumb,
      images: images.map((image) => ({ url: image.url, alt: image.alt ?? null })),
      technicalSpecs: sanitizeTechnicalSpecs(lensed.technicalSpecs),
      datasheets: sanitizeDatasheets(lensed.documents),
      price: product.lifecycleStatus === 'PUBLISHED' ? price : null,
      isInformational: product.lifecycleStatus !== 'PUBLISHED',
    };
  }

  /** Key-spec facets of a subcategory over the products visible under the public rule. */
  async keySpecFacets(subcategoryId: string): Promise<KeySpecFacetsView> {
    if (!this.keySpecs) throw new Error('Key-spec facets need PublishedKeySpecsService');
    return this.keySpecs.facets(subcategoryId, await this.visibility(OperationalPrisma.JsonNull));
  }

  /**
   * Products matching the public text search and/or category filter, evaluated on the PUBLISHED
   * snapshot: `name`/`sku`/`catalogName`/`catalogModel`/`categoryId` of the pinned PUBLICADA revision
   * when it holds the key, otherwise the live column. `catalogManufacturerRefs` (SKUs of deleted
   * duplicates) is matched live: it only finds the product, it is never shown. Each row carries its
   * relevance `rank` (0 exact, 1 starts with, 2 contains, 3 every word) and the published name.
   * Visibility is NOT decided here (the caller applies it).
   * Fully parameterized; the text match is case-insensitive and has no LIKE wildcards.
   */
  private async snapshotMatches(term: string, categoryIds?: string[]): Promise<SnapshotMatch[]> {
    const params: unknown[] = [];
    const bind = (value: unknown) => {
      params.push(value);
      return `$${params.length}`;
    };
    const published = (key: string, live: string) => `COALESCE(r.content->>'${key}', ${live})`;
    const name = published('name', 'p.name');
    const conditions: string[] = [];
    let rank = '0';
    if (term !== '') {
      const codeLike = looksLikeCode(term);
      const termParam = bind(term);
      const search = buildProductSearchSql({
        param: termParam,
        alias: 'p',
        codeLike,
        columns: {
          sku: published('sku', 'p.sku'),
          model: published('catalogModel', 'p."catalogModel"'),
          name,
          catalogName: published('catalogName', 'p."catalogName"'),
          description: null,
        },
      });
      // Several words (not a code): every word must appear somewhere in the name/SKU/model.
      const words = codeLike ? [] : [...new Set(term.toLowerCase().split(/\s+/).filter(Boolean))];
      const wordsMatch = words.length > 1
        ? `NOT EXISTS (SELECT 1 FROM unnest(${bind(words)}::text[]) AS w(v) WHERE strpos(lower(concat_ws(' ', ${name}, ${published('catalogName', 'p."catalogName"')}, ${published('sku', 'p.sku')}, ${published('catalogModel', 'p."catalogModel"')})), w.v) = 0)`
        : 'false';
      conditions.push(`(${search.literal} OR ${wordsMatch})`);
      rank = search.rank;
    }
    if (categoryIds) {
      conditions.push(`(CASE WHEN r.content IS NOT NULL AND jsonb_exists(r.content, 'categoryId')
        THEN r.content->>'categoryId' ELSE p."categoryId" END) = ANY(${bind(categoryIds)}::text[])`);
    }
    const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string; rank: number; name: string | null }>>(
      `SELECT p.id, (${rank})::int AS rank, ${name} AS name
       FROM products p
       LEFT JOIN product_revisions r ON r.id = p."publicRevisionId" AND r.status = 'PUBLICADA'
       WHERE ${conditions.join(' AND ')}`,
      ...params,
    );
    return rows.map((r) => ({ id: r.id, rank: Number(r.rank), name: r.name ?? '' }));
  }

  /**
   * Brand and category as PUBLISHED: the snapshot's ids when the revision holds them, else the
   * live relations already selected. Only ids that differ from the live ones are loaded.
   */
  private async publishedRefs<T extends {
    publicRevisionId?: string | null; categoryId: string | null; brandId: string | null;
    category: unknown; brand: unknown;
  }>(rows: T[], contents: Map<string, Record<string, unknown>>) {
    const eff = (r: T) => ({
      categoryId: effectiveIdentity(r, contents, 'categoryId', r.categoryId),
      brandId: effectiveIdentity(r, contents, 'brandId', r.brandId),
    });
    const needCat = new Set<string>();
    const needBrand = new Set<string>();
    for (const r of rows) {
      const e = eff(r);
      if (e.categoryId && e.categoryId !== (r.categoryId ?? null)) needCat.add(e.categoryId);
      if (e.brandId && e.brandId !== (r.brandId ?? null)) needBrand.add(e.brandId);
    }
    const [cats, brands] = await Promise.all([
      needCat.size
        ? this.prisma.category.findMany({ where: { id: { in: [...needCat] } }, select: { id: true, name: true, slug: true, parentId: true } })
        : Promise.resolve([] as PublishedCategory[]),
      needBrand.size
        ? this.prisma.brand.findMany({ where: { id: { in: [...needBrand] } }, select: { id: true, name: true, slug: true } })
        : Promise.resolve([] as Array<PublishedBrand & { id: string }>),
    ]);
    const catById = new Map<string, PublishedCategory>(cats.map((c) => [c.id as string, c]));
    const brandById = new Map<string, PublishedBrand>(brands.map((b) => [b.id, b]));
    return (r: T): { category: PublishedCategory | null; brand: PublishedBrand | null } => {
      const e = eff(r);
      return {
        category: e.categoryId === (r.categoryId ?? null) ? (r.category as PublishedCategory | null) : e.categoryId ? (catById.get(e.categoryId) ?? null) : null,
        brand: e.brandId === (r.brandId ?? null) ? (r.brand as PublishedBrand | null) : e.brandId ? (brandById.get(e.brandId) ?? null) : null,
      };
    };
  }

  /** Solo carga el árbol de categorías cuando la categoría del producto tiene padre. */
  private async breadcrumbOf(parentId: string | null): Promise<PublicCategoryRef[]> {
    if (parentId === null) return [];
    const categories = await this.prisma.category.findMany({
      select: { id: true, name: true, slug: true, parentId: true },
    });
    return buildBreadcrumb(categories, parentId);
  }
}
