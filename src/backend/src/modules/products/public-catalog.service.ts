import { Injectable, NotFoundException } from '@nestjs/common';
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

/** Fila del listado público: solo campos aptos para un visitante anónimo. */
export interface PublicProductListItem {
  id: string;
  sku: string;
  name: string;
  imageUrl: string | null;
  categoryName: string;
  categorySlug: string;
  brandName: string;
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
}

export const PUBLIC_LIST_DEFAULT_LIMIT = 24;

/**
 * Lectura pública del catálogo para el storefront. Todas las consultas usan un
 * `select` explícito (nunca se propaga una fila de producto) y solo devuelven
 * productos publicados (estado canónico PUBLISHED de la FSM). Los precios
 * llegan exclusivamente de `PublicPricingService`.
 */
@Injectable()
export class PublicCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PublicPricingService,
  ) {}

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

    const where = {
      lifecycleStatus: 'PUBLISHED',
      ...(categoryIds && { categoryId: { in: categoryIds } }),
      ...(term !== '' && {
        OR: [
          { name: { contains: term, mode: 'insensitive' as const } },
          { sku: { contains: term, mode: 'insensitive' as const } },
        ],
      }),
    };

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        select: {
          id: true,
          sku: true,
          name: true,
          category: { select: { name: true, slug: true } },
          brand: { select: { name: true } },
          images: {
            where: { isPrimary: true },
            select: { url: true },
            take: 1,
            orderBy: { sortOrder: 'asc' },
          },
        },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: offset,
        take: limit,
      }),
      this.prisma.product.count({ where }),
    ]);

    const prices = await this.pricing.getPublicPrices(products.map((p) => p.id));

    return {
      data: products.map((p) => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        imageUrl: p.images[0]?.url ?? null,
        categoryName: p.category.name,
        categorySlug: p.category.slug,
        brandName: p.brand.name,
        price: prices.get(p.id) ?? null,
      })),
      meta: { total, offset, limit },
    };
  }

  /**
   * Ficha pública de un producto. Un id inexistente y un producto que no está
   * PUBLISHED responden igual (404) para no revelar el estado interno.
   */
  async getDetail(id: string): Promise<PublicProductDetail> {
    const product = await this.prisma.product.findFirst({
      where: { id, lifecycleStatus: 'PUBLISHED' },
      select: {
        id: true,
        sku: true,
        name: true,
        description: true,
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

    const [price, breadcrumb] = await Promise.all([
      this.pricing.getPublicPrice(product.id),
      this.breadcrumbOf(product.category?.parentId ?? null),
    ]);

    // Primaria primero; el resto conserva el orden por sortOrder de la consulta.
    const images = [...product.images].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));

    return {
      id: product.id,
      sku: product.sku,
      name: product.name,
      description: product.description ?? null,
      brand: product.brand ? { name: product.brand.name, slug: product.brand.slug } : null,
      category: product.category ? { name: product.category.name, slug: product.category.slug } : null,
      breadcrumb,
      images: images.map((image) => ({ url: image.url, alt: image.alt ?? null })),
      technicalSpecs: sanitizeTechnicalSpecs(product.technicalSpecs),
      datasheets: sanitizeDatasheets(product.documents),
      price,
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
