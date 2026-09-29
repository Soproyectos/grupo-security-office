import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
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
   * Búsqueda pública (HOM-02): publicados por nombre o SKU. El modelo Product
   * no tiene slug propio; el resultado enlaza a la categoría por su slug.
   */
  async search(params: { q?: string; limit?: number }): Promise<{ data: PublicProductListItem[] }> {
    const term = params.q?.trim() ?? '';
    const take = params.limit ?? 24;

    const products = await this.prisma.product.findMany({
      where: {
        lifecycleStatus: 'PUBLISHED',
        ...(term !== '' && {
          OR: [
            { name: { contains: term, mode: 'insensitive' } },
            { sku: { contains: term, mode: 'insensitive' } },
          ],
        }),
      },
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
      orderBy: [{ name: 'asc' }],
      take,
    });

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
    };
  }
}
