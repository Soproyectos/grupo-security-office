import { randomUUID } from 'crypto';
import { ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AclService, AccessContext } from '../../common/acl/acl.service';
import { AccessAssignmentsService } from '../../common/security/access-assignments.service';
import { decideCatalogResourceAccess } from '../../common/security/catalog-resource-access';
import { concessionCanAction } from '../../common/security/d5-action';

export const PRODUCT_CHANGE_SOURCES = [
  'PRICE_IMPORT', 'MANUAL', 'PRODUCT_IMPORT', 'BIBLIOTECA_IMPORT', 'LIFECYCLE', 'SYSTEM',
] as const;
export type ProductChangeSource = typeof PRODUCT_CHANGE_SOURCES[number];

export const PRICE_FIELD_PREFIX = 'price:';
export const PRODUCT_CHANGES_MAX_LIMIT = 100;
export const PRODUCT_CHANGES_DEFAULT_LIMIT = 50;

/** One field-level change of a product, as written to `product_changes`. */
export interface ProductChangeInput {
  productId: string;
  sku: string;
  field: string;
  oldValue: Prisma.InputJsonValue | null;
  newValue: Prisma.InputJsonValue | null;
  source: ProductChangeSource;
  sourceRef?: string | null;
  actorId?: string | null;
  batchId?: string | null;
}

export interface DiffMeta {
  productId: string;
  sku: string;
  source: ProductChangeSource;
  sourceRef?: string | null;
  actorId?: string | null;
  batchId?: string | null;
}

/**
 * History sources that are NOT recorded yet. Returned with every read so the UI
 * can say the history is incomplete for them instead of implying it is total.
 */
export const PRODUCT_HISTORY_COVERAGE = {
  complete: false,
  recorded: [
    { source: 'PRICE_IMPORT', label: 'Aplicación de importación de precios' },
    { source: 'MANUAL_PRICE', label: 'Precios manuales (crear, editar, eliminar)' },
    { source: 'PRODUCT_CREATE_UPDATE', label: 'Creación y edición de productos' },
    { source: 'LIFECYCLE', label: 'Publicación, archivo, programación y restauración' },
  ],
  notRecorded: [
    { source: 'IMAGES', label: 'Imágenes del producto' },
    { source: 'VITRINA_SHEET', label: 'Ficha de vitrina' },
    { source: 'LEGACY_PRODUCT_IMPORT', label: 'Importación de productos anterior' },
    { source: 'BIBLIOTECA_IMPORT', label: 'Importación de Biblioteca' },
    { source: 'HARD_DELETE', label: 'Eliminación definitiva' },
    { source: 'LISTA_UNLINK', label: 'Desvinculación de lista' },
  ],
} as const;

function isDecimalLike(value: unknown): value is { toString(): string; equals(other: unknown): boolean } {
  return typeof value === 'object' && value !== null && Prisma.Decimal.isDecimal(value);
}

/**
 * Canonical JSON form of a value so equal values compare equal: Decimals become
 * plain decimal strings without trailing zeros, Dates ISO strings, undefined null.
 */
export function normalizeChangeValue(value: unknown): Prisma.InputJsonValue | null {
  if (value === undefined || value === null) return null;
  if (isDecimalLike(value)) return new Prisma.Decimal(value as Prisma.Decimal).toString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map((v) => normalizeChangeValue(v)) as Prisma.InputJsonValue;
  if (typeof value === 'object') {
    const out: Record<string, Prisma.InputJsonValue | null> = {};
    for (const key of Object.keys(value as object).sort()) {
      const item = (value as Record<string, unknown>)[key];
      if (item !== undefined) out[key] = normalizeChangeValue(item);
    }
    return out as Prisma.InputJsonValue;
  }
  return value as Prisma.InputJsonValue;
}

function sameValue(a: unknown, b: unknown): boolean {
  if (isDecimalLike(a) || isDecimalLike(b)) {
    const bothNumeric = (v: unknown) => isDecimalLike(v) || (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v)) || typeof v === 'number';
    if (bothNumeric(a) && bothNumeric(b)) {
      return new Prisma.Decimal(a as Prisma.Decimal.Value).equals(new Prisma.Decimal(b as Prisma.Decimal.Value));
    }
  }
  return JSON.stringify(normalizeChangeValue(a)) === JSON.stringify(normalizeChangeValue(b));
}

/**
 * Pure: one row per field whose value differs. A field absent (undefined) from
 * `after` is not being updated and is skipped; null means "cleared".
 */
export function diffFields(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown>,
  fields: readonly string[],
  meta: DiffMeta,
): ProductChangeInput[] {
  const out: ProductChangeInput[] = [];
  for (const field of fields) {
    const next = after[field];
    if (next === undefined) continue;
    const prev = before ? before[field] : undefined;
    if (sameValue(prev, next)) continue;
    out.push({
      productId: meta.productId,
      sku: meta.sku,
      field,
      oldValue: normalizeChangeValue(prev),
      newValue: normalizeChangeValue(next),
      source: meta.source,
      sourceRef: meta.sourceRef ?? null,
      actorId: meta.actorId ?? null,
      batchId: meta.batchId ?? null,
    });
  }
  return out;
}

export function newBatchId(): string {
  return randomUUID();
}

export interface ProductChangeQuery {
  cursor?: string;
  limit?: number | string;
  field?: string;
  source?: string;
}

export function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}|${id}`, 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string): { createdAt: Date; id: string } | null {
  try {
    const [iso, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
    const createdAt = new Date(iso);
    if (!id || Number.isNaN(createdAt.getTime())) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

@Injectable()
export class ProductChangeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly acl: AclService,
    @Optional() private readonly grants?: AccessAssignmentsService,
  ) {}

  /** Writes the changes through the caller's transaction client. */
  async record(tx: Pick<Prisma.TransactionClient, 'productChange'>, changes: readonly ProductChangeInput[]): Promise<number> {
    if (changes.length === 0) return 0;
    const result = await tx.productChange.createMany({
      data: changes.map((c) => ({
        productId: c.productId,
        sku: c.sku,
        field: c.field,
        oldValue: c.oldValue === null ? Prisma.DbNull : c.oldValue,
        newValue: c.newValue === null ? Prisma.DbNull : c.newValue,
        source: c.source,
        sourceRef: c.sourceRef ?? null,
        actorId: c.actorId ?? null,
        batchId: c.batchId ?? null,
      })),
    });
    return result.count;
  }

  /**
   * Newest-first history of one product. Requires `products:read` on the product
   * (and the existing product access check); `price:*` fields additionally need
   * `prices:read` on the product's lista (or global) and are otherwise left out
   * of the page and of its pagination.
   */
  async list(productId: string, ctx: AccessContext, query: ProductChangeQuery = {}) {
    const product = await this.authorize(productId, ctx);
    const canSeePrices = (await decideCatalogResourceAccess(this.grants, 'prices:read', ctx, {
      id: product.id, kind: 'product', productId: product.id, listId: product.listaId ?? undefined,
    })).allowed;

    const limit = this.parseLimit(query.limit);
    const and: Prisma.ProductChangeWhereInput[] = [];
    if (!canSeePrices) and.push({ NOT: { field: { startsWith: PRICE_FIELD_PREFIX } } });
    if (query.field) {
      if (!canSeePrices && query.field.startsWith(PRICE_FIELD_PREFIX)) {
        return this.emptyPage(limit);
      }
      and.push({ field: query.field });
    }
    if (query.source) and.push({ source: query.source });
    if (query.cursor) {
      const cursor = decodeCursor(query.cursor);
      if (!cursor) return this.emptyPage(limit);
      and.push({ OR: [
        { createdAt: { lt: cursor.createdAt } },
        { createdAt: cursor.createdAt, id: { lt: cursor.id } },
      ] });
    }

    const rows = await this.prisma.productChange.findMany({
      where: { productId, ...(and.length ? { AND: and } : {}) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const last = items[items.length - 1];
    return {
      items,
      nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
      limit,
      coverage: PRODUCT_HISTORY_COVERAGE,
      priceFieldsIncluded: canSeePrices,
    };
  }

  private emptyPage(limit: number) {
    return { items: [], nextCursor: null, limit, coverage: PRODUCT_HISTORY_COVERAGE, priceFieldsIncluded: false };
  }

  private parseLimit(raw: number | string | undefined): number {
    const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : raw;
    if (!n || !Number.isFinite(n) || n < 1) return PRODUCT_CHANGES_DEFAULT_LIMIT;
    return Math.min(Math.floor(n), PRODUCT_CHANGES_MAX_LIMIT);
  }

  /** Same decision order as the product sheet read: action, product, scoped action, product ACL. */
  private async authorize(productId: string, ctx: AccessContext): Promise<{ id: string; listaId: string | null }> {
    const denied = () => new ForbiddenException('Sin permiso products:read');
    // Reject users without the action before loading the product (no existence leak).
    if (!(await concessionCanAction(this.grants, 'products:read', ctx)).allowed) throw denied();
    const product = await this.prisma.product.findUnique({ where: { id: productId }, select: { id: true, listaId: true } });
    if (!product) throw new NotFoundException('Producto no encontrado');
    const scoped = await decideCatalogResourceAccess(this.grants, 'products:read', ctx, {
      id: product.id, kind: 'product', productId: product.id, listId: product.listaId ?? undefined,
    });
    if (!scoped.allowed) throw denied();
    await this.acl.assertProductAccess(productId, ctx, 'view');
    return product;
  }
}
