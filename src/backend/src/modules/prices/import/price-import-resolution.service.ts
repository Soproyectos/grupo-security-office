import { BadRequestException, ConflictException, ForbiddenException, HttpException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AccessContext } from '../../../common/acl/acl.service';
import { CopPriceError, normalizeCopPrice } from '../../../common/money/cop-policy';
import { PrismaService } from '../../../prisma/prisma.service';
import { DEFAULT_BRAND_NAME, DEFAULT_CATEGORY_NAME } from '../../../scripts/import-biblioteca.logic';
import { AuditService } from '../../audit/audit.service';
import { diffFields, newBatchId, PRICE_FIELD_PREFIX, ProductChangeService, type ProductChangeInput } from '../../products/product-change.service';
import { ProductsService } from '../../products/products.service';
import { PRICE_IMPORT_INCIDENCE_CODES } from './price-import.types';
import { PriceImportService } from './price-import.service';

export const MAX_RESOLUTION_ITEMS = 200;

export type ResolutionItem =
  | { rowNumber: number; action: 'CREATE'; name: string; brandId: string; categoryId: string }
  | { rowNumber: number; action: 'SKIP' };

export interface ResolutionOutcome {
  rowNumber: number;
  status: 'CREATED' | 'SKIPPED' | 'FAILED';
  code?: string;
  message?: string;
  productId?: string;
}

export interface UnknownReferenceView {
  revisionId: string;
  status: string;
  canCreate: boolean;
  defaults: { brandId: string | null; categoryId: string | null };
  items: Array<{
    rowNumber: number;
    sku: string;
    canCreate: boolean;
    prices: Array<{ tariffCode: string; received: string; value: string }>;
  }>;
  total: number;
  page: number;
  pageSize: number;
}

/** Marks an item failure with a machine code; the item's transaction rolls back and the batch goes on. */
class ItemFailure extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

/**
 * R2 — resolution of the unknown SKUs of an APPLIED revision: create the hidden
 * "pending ficha" draft (and write the price rows of that file row) or skip the row.
 *
 * Authorization is decided HERE (the controller only authenticates), like customers
 * and quotes: reading needs `prices:read` over the revision; SKIP adds nothing; CREATE
 * needs `products:write` AND `prices:apply` with GLOBAL scope (the draft has no lista).
 * One transaction PER item: a failed item never rolls back the others.
 */
@Injectable()
export class PriceImportResolutionService {
  private readonly logger = new Logger(PriceImportResolutionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly imports: PriceImportService,
    private readonly products: ProductsService,
    private readonly changes: ProductChangeService,
    private readonly audit: AuditService,
  ) {}

  async listUnknownReferences(id: string, ctx: AccessContext, page = 1, pageSize = 100): Promise<UnknownReferenceView> {
    const revision = await this.imports.loadRevisionForResolution(id, ctx);
    const canCreate = revision.status === 'APLICADA' && (await this.imports.canCreateDrafts(ctx));
    const take = Math.min(Math.max(Math.trunc(pageSize) || 100, 1), MAX_RESOLUTION_ITEMS);
    const current = Math.max(Math.trunc(page) || 1, 1);

    const rows = (await this.prisma.priceImportRevisionRow.findMany({
      where: { revisionId: id, resolution: 'PENDING_PRODUCT' }, orderBy: { rowNumber: 'asc' },
    })).filter((r) => (r.issues as unknown as Array<{ code?: string }> | null)?.some((i) => i.code === PRICE_IMPORT_INCIDENCE_CODES.UNKNOWN_REFERENCE));
    const pageRows = rows.slice((current - 1) * take, current * take);
    const numbers = new Set(pageRows.map((r) => r.rowNumber));
    const prices = (await this.prisma.priceImportRevisionPrice.findMany({ where: { revisionId: id } })).filter((p) => numbers.has(p.rowNumber));

    const [brand, category] = await Promise.all([
      this.prisma.brand.findFirst({ where: { name: DEFAULT_BRAND_NAME }, select: { id: true } }),
      this.prisma.category.findFirst({ where: { name: DEFAULT_CATEGORY_NAME }, select: { id: true } }),
    ]);
    return {
      revisionId: id,
      status: revision.status,
      canCreate,
      defaults: { brandId: brand?.id ?? null, categoryId: category?.id ?? null },
      items: pageRows.map((r) => ({
        rowNumber: r.rowNumber,
        sku: r.sku,
        canCreate,
        prices: prices.filter((p) => p.rowNumber === r.rowNumber).map((p) => ({ tariffCode: p.tariffCode, received: p.receivedValue, value: p.roundedValue })),
      })),
      total: rows.length,
      page: current,
      pageSize: take,
    };
  }

  async resolve(id: string, items: readonly ResolutionItem[], ctx: AccessContext): Promise<{ revisionId: string; results: ResolutionOutcome[] }> {
    if (items.length === 0 || items.length > MAX_RESOLUTION_ITEMS) {
      throw new BadRequestException({ code: 'INVALID_ITEM_COUNT', message: `Envía entre 1 y ${MAX_RESOLUTION_ITEMS} filas.` });
    }
    if (new Set(items.map((i) => i.rowNumber)).size !== items.length) {
      throw new BadRequestException({ code: 'DUPLICATE_ROWS', message: 'Una fila aparece más de una vez en la solicitud.' });
    }
    const revision = await this.imports.loadRevisionForResolution(id, ctx);
    if (items.some((i) => i.action === 'CREATE') && !(await this.imports.canCreateDrafts(ctx))) {
      throw new ForbiddenException('Crear productos desde una importación exige products:write y prices:apply con alcance global.');
    }
    if (revision.status !== 'APLICADA') {
      throw new ConflictException({ code: 'REVISION_NOT_APPLIED', message: 'Las referencias desconocidas se resuelven después de aplicar la revisión.' });
    }

    const results: ResolutionOutcome[] = [];
    for (const item of items) {
      results.push(await this.resolveOne(id, item, ctx));
    }
    return { revisionId: id, results };
  }

  private async resolveOne(revisionId: string, item: ResolutionItem, ctx: AccessContext): Promise<ResolutionOutcome> {
    try {
      return await (item.action === 'SKIP' ? this.skip(revisionId, item.rowNumber, ctx) : this.create(revisionId, item, ctx));
    } catch (error) {
      return this.toFailure(item.rowNumber, error);
    }
  }

  private toFailure(rowNumber: number, error: unknown): ResolutionOutcome {
    if (error instanceof ItemFailure) return { rowNumber, status: 'FAILED', code: error.code, message: error.message };
    // The unique normalized-SKU index lost a race with a concurrent insert: never a duplicate.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { rowNumber, status: 'FAILED', code: 'SKU_EXISTS', message: 'Ya existe un producto con ese SKU. Vuelve a aplicar o revisar la importación.' };
    }
    if (error instanceof HttpException) {
      const body = error.getResponse() as { code?: string; message?: string } | string;
      const code = typeof body === 'object' && body.code ? body.code : error.name;
      const message = typeof body === 'object' && body.message ? body.message : error.message;
      return { rowNumber, status: 'FAILED', code, message };
    }
    this.logger.error(`Unknown-reference resolution failed for row ${rowNumber}: ${error instanceof Error ? error.message : 'unknown error'}`);
    return { rowNumber, status: 'FAILED', code: 'INTERNAL_ERROR', message: 'No se pudo resolver esta fila.' };
  }

  /** Outcome of a row that is no longer pending (idempotent replay of the same request). */
  private async previousOutcome(client: Pick<Prisma.TransactionClient, 'priceImportRevisionRow'>, revisionId: string, rowNumber: number): Promise<ResolutionOutcome> {
    const row = await client.priceImportRevisionRow.findFirst({ where: { revisionId, rowNumber } });
    if (!row) return { rowNumber, status: 'FAILED', code: 'ROW_NOT_FOUND', message: 'La fila no existe en esta revisión.' };
    if (row.resolution === 'PRODUCT_CREATED') return { rowNumber, status: 'CREATED', productId: row.productId ?? undefined };
    if (row.resolution === 'SKIPPED') return { rowNumber, status: 'SKIPPED' };
    return { rowNumber, status: 'FAILED', code: 'ROW_NOT_PENDING', message: 'Esta fila no tiene una referencia desconocida pendiente.' };
  }

  private async skip(revisionId: string, rowNumber: number, ctx: AccessContext): Promise<ResolutionOutcome> {
    return this.prisma.$transaction(async (tx) => {
      const claim = await tx.priceImportRevisionRow.updateMany({
        where: { revisionId, rowNumber, resolution: 'PENDING_PRODUCT' },
        data: { resolution: 'SKIPPED', resolvedAt: new Date(), resolvedById: ctx.userId ?? null },
      });
      if (claim.count === 0) return this.previousOutcome(tx, revisionId, rowNumber);
      await this.audit.logTx(tx, {
        userId: ctx.userId, action: 'price-import-skip-unknown', entity: 'Price', entityId: revisionId,
        newValues: { revisionId, rowNumber }, result: 'SUCCESS',
      });
      return { rowNumber, status: 'SKIPPED' as const };
    });
  }

  private async create(revisionId: string, item: Extract<ResolutionItem, { action: 'CREATE' }>, ctx: AccessContext): Promise<ResolutionOutcome> {
    const { rowNumber } = item;
    return this.prisma.$transaction(async (tx) => {
      // Claim first: a concurrent identical request waits on the row lock, then finds nothing pending.
      const claim = await tx.priceImportRevisionRow.updateMany({
        where: { revisionId, rowNumber, resolution: 'PENDING_PRODUCT' },
        data: { resolution: 'PRODUCT_CREATED', resolvedAt: new Date(), resolvedById: ctx.userId ?? null },
      });
      if (claim.count === 0) return this.previousOutcome(tx, revisionId, rowNumber);

      const row = await tx.priceImportRevisionRow.findFirst({ where: { revisionId, rowNumber } });
      if (!row) throw new ItemFailure('ROW_NOT_FOUND', 'La fila no existe en esta revisión.');
      const stored = await tx.priceImportRevisionPrice.findMany({ where: { revisionId, rowNumber } });
      if (stored.length === 0) throw new ItemFailure('NO_PRICES', 'La fila no tiene precios válidos para aplicar.');

      // Tariffs must still be configured, active, COP and in force; the stored values are revalidated.
      const now = new Date();
      const tariffIds = [...new Set(stored.map((p) => p.priceListId).filter((v): v is string => !!v))];
      const tariffs = tariffIds.length ? await tx.priceList.findMany({ where: { id: { in: tariffIds } } }) : [];
      const tariffById = new Map(tariffs.map((t) => [t.id, t]));
      const planned = stored.map((p) => {
        const tariff = p.priceListId ? tariffById.get(p.priceListId) : undefined;
        if (!tariff || !tariff.isActive || tariff.currency !== 'COP' ||
          (tariff.validFrom && tariff.validFrom > now) || (tariff.validUntil && tariff.validUntil <= now)) {
          throw new ItemFailure('TARIFF_UNAVAILABLE', `La tarifa ${p.tariffCode} no está configurada, activa o vigente en COP. No se creó nada.`);
        }
        try {
          return { priceListId: tariff.id, code: tariff.code, value: normalizeCopPrice(p.roundedValue).rounded };
        } catch (error) {
          if (error instanceof CopPriceError) throw new ItemFailure('INVALID_PRICE', `El precio de ${p.tariffCode} ya no es válido. No se creó nada.`);
          throw error;
        }
      });

      const product = await this.products.createPendingSheetDraft(
        tx, { sku: row.sku, name: item.name, brandId: item.brandId, categoryId: item.categoryId, sourceRevisionId: revisionId }, { userId: ctx.userId },
      );

      // Brand-new product: no previous value exists, so there is no PRICE_CHANGED conflict. Price.listaId stays null.
      const batchId = newBatchId();
      const history: ProductChangeInput[] = [];
      for (const price of planned) {
        const value = new Prisma.Decimal(price.value);
        await tx.price.create({ data: { productId: product.id, priceListId: price.priceListId, value, currency: 'COP', listaId: null } });
        const field = `${PRICE_FIELD_PREFIX}${price.code}`;
        history.push(...diffFields({}, { [field]: value }, [field], {
          productId: product.id, sku: product.sku, source: 'PRICE_IMPORT', sourceRef: revisionId, actorId: ctx.userId ?? null, batchId,
        }));
      }
      await this.changes.record(tx, history);
      await tx.priceImportRevisionRow.updateMany({ where: { revisionId, rowNumber }, data: { productId: product.id, listaId: null } });
      await this.audit.logTx(tx, {
        userId: ctx.userId, action: 'price-import-create-product', entity: 'Price', entityId: revisionId, productId: product.id,
        newValues: { revisionId, rowNumber, productId: product.id, tariffs: planned.map((p) => p.code), batchId }, result: 'SUCCESS',
      });
      return { rowNumber, status: 'CREATED' as const, productId: product.id };
    });
  }
}
