import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/** Lista de precios pública por defecto: COP con IVA incluido (precio al cliente final). */
export const DEFAULT_PUBLIC_PRICE_LIST_CODE = 'CLIENTE_FINAL_IVA';

/** Único precio que un visitante anónimo puede ver. */
export interface PublicPrice {
  value: number;
  currency: string;
}

/**
 * Ventana de vigencia abierta en `now`: `null` significa sin límite. Se usa
 * tanto para `PriceList` como para `Price`.
 */
function openWindow(now: Date) {
  return [
    { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
    { OR: [{ validUntil: null }, { validUntil: { gte: now } }] },
  ];
}

/**
 * Resolución del precio público del storefront. Es la ÚNICA puerta por la que
 * un precio llega a un visitante anónimo: filtra estrictamente por el código de
 * la lista pública (`PUBLIC_PRICE_LIST_CODE`, por defecto `CLIENTE_FINAL_IVA`),
 * lista activa y ambas vigencias, y solo selecciona `productId`, `value` y
 * `currency` (nunca costos, otras listas ni datos de ACL).
 */
@Injectable()
export class PublicPricingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Código de la lista pública; un valor vacío en el entorno cae al default. */
  get priceListCode(): string {
    const configured = this.config.get<string>('PUBLIC_PRICE_LIST_CODE')?.trim();
    return configured || DEFAULT_PUBLIC_PRICE_LIST_CODE;
  }

  /**
   * Precio público de varios productos en UNA sola consulta. El mapa contiene
   * todos los ids pedidos: `null` cuando el producto no tiene un precio público
   * vigente (el producto sigue siendo público, solo sin precio).
   */
  async getPublicPrices(productIds: string[]): Promise<Map<string, PublicPrice | null>> {
    const ids = [...new Set(productIds)];
    const prices = new Map<string, PublicPrice | null>(ids.map((id) => [id, null]));
    if (ids.length === 0) return prices;

    const now = new Date();
    const rows = await this.prisma.price.findMany({
      where: {
        productId: { in: ids },
        AND: openWindow(now),
        priceList: {
          code: this.priceListCode,
          isActive: true,
          AND: openWindow(now),
        },
      },
      select: { productId: true, value: true, currency: true },
    });

    for (const row of rows) {
      const price = toPublicPrice(row);
      if (price) prices.set(row.productId, price);
    }
    return prices;
  }

  async getPublicPrice(productId: string): Promise<PublicPrice | null> {
    return (await this.getPublicPrices([productId])).get(productId) ?? null;
  }
}

/** Decimal(12,2) → number. Un valor no numérico o no positivo no es un precio público. */
function toPublicPrice(row: { value: Prisma.Decimal | number | string; currency: string }): PublicPrice | null {
  const value = Number(row.value);
  if (!Number.isFinite(value) || value <= 0) return null;
  return { value, currency: row.currency };
}
