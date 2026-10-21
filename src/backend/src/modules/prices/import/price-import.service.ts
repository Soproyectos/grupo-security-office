import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { AclService, AccessContext } from '../../../common/acl/acl.service';
import { AccessAssignmentsService } from '../../../common/security/access-assignments.service';
import { resolveAccess } from '../../../common/security/data-scope';
import type { AccessIdentity } from '../../../common/security/data-scope';
import { COP_POLICY_VERSION, normalizeCopPrice } from '../../../common/money/cop-policy';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { findProductMatchesBySkus, normalizeSku } from '../../products/helpers/sku-identity';
import { diffFields, newBatchId, PRICE_FIELD_PREFIX, ProductChangeService, type ProductChangeInput } from '../../products/product-change.service';
import { PriceImportAccess, isSuperAdmin, type ProductRef } from './price-import-authz';
import { clampChangePercentForStorage, measurePriceChange } from './price-import-change';
import { buildPriceTemplate, readPriceTemplate, type TemplateReferenceInput } from './price-template';
import {
  profileMatchesHeaders,
  profileStructureChanged,
  resolveExternalReferences,
  validateProviderProfile,
  type EquivalenceInput,
  type NormalizedProviderProfile,
  type ProviderProfileInput,
  type ProviderProfileView,
  type RecognitionView,
  type ResolvedReference,
} from './provider-profile';
import { MAX_PRICE_IMPORT_ROWS, PRICE_IMPORT_INCIDENCE_CODES, PRICE_IMPORT_PARSER_VERSION, resolveLargeChangeThresholdPct, PRICE_IMPORT_TARIFFS, PRICE_IMPORT_TRAILER_VERSION, PRICE_IMPORT_APPLY_CODES, PriceImportApplyOptions, PriceImportApplyPerLista, PriceImportIssue, PriceImportListaSummary, PriceImportPreview, PriceImportRevisionApplyConflict, PriceImportRevisionApplyResult, PriceImportRevisionDetail, PriceImportRevisionHeader, PriceImportRevisionPage, PriceImportRevisionTariff, PriceImportRow, type PriceImportTariff } from './price-import.types';
import { deletePriceImportFile, priceImportFileExists, readPriceImportFile, storePriceImportFile } from './price-import-storage';

/** Tarifa configurada resuelta al revisar (se captura como versión en la revisión). */
interface ConfiguredTariff {
  id: string;
  code: string;
  isActive: boolean;
  currency: string;
  validFrom: Date | null;
  validUntil: Date | null;
}

const APPLY_MAX_ATTEMPTS = 3;
const COMPACT_LIST_LIMIT = 50;
/** Large imports write up to 5,000 rows x 5 tariffs one by one: the default 5 s interactive limit is far too short. */
const APPLY_TX_OPTIONS = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 120_000 };
const REVISION_PAGE_SIZE = 25;
const REVISION_ROWS_PAGE_SIZE = 100;
/** Stand-in id to ask "may the caller see products without a lista at all" (only a global grant says yes). */
const UNLISTED_SENTINEL = 'unlisted-products';

/** Internal per-row snapshot persisted with a revision; never returned for rows of inaccessible listas. */
interface RowSnapshot { productId: string; listaId: string | null }
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * IMP-07B (07B) — fila de perfil con sus equivalencias opcionales. Estructural:
 * el resultado de Prisma (con más campos) es compatible.
 */
interface ProviderProfileRow {
  id: string;
  providerName: string;
  sheet: string;
  headerRow: number;
  thousandsSeparator: string;
  decimalSeparator: string;
  currency: string;
  tariffs: unknown;
  expectedColumns: unknown;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  equivalences?: Array<{ externalRef: string; productId: string }>;
}

@Injectable()
export class PriceImportService {
  private readonly changes: ProductChangeService;

  constructor(
    private prisma: PrismaService,
    private acl: AclService,
    private audit: AuditService,
    /**
     * CAT-01-IMP integración: concesiones vigentes (patrón de la tanda). Opcional
     * para conservar construcciones de 3 argumentos en specs; Nest lo inyecta.
     */
    @Optional() private grants?: AccessAssignmentsService,
    /** Per-product history writer (Nest injects the shared one; specs may omit it). */
    @Optional() changes?: ProductChangeService,
  ) {
    this.changes = changes ?? new ProductChangeService(prisma, acl, grants);
  }

  /**
   * Revalida por SOLICITUD las acciones del preview contra las concesiones
   * vigentes (LEEME 6). Con grants en el sistema manda la concesión
   * (`resolveAccess`). La identidad se arma con los flags que JwtStrategy
   * atestigua; nunca del cuerpo de la petición.
   *
   * `@Optional` sobre `grants` (para conservar specs con 3 argumentos) NUNCA
   * autoriza por omisión: si el servicio de concesiones no está inyectado, la
   * única vía que queda es la excepción explícita de Super Admin de
   * `resolveAccess`. Un usuario legado sin concesiones vigentes queda denegado
   * aquí; no se hereda autorización desde el hecho de faltar el servicio.
   */
  private async assertActions(ctx: AccessContext, actionIds: readonly string[], deniedMessage: string): Promise<void> {
    if (!ctx.userId) {
      throw new ForbiddenException(deniedMessage);
    }
    // Sin servicio de concesiones inyectado: denegar (no autorizar por omisión).
    // Super Admin sigue exento por la excepción explícita de resolveAccess.
    if (!this.grants) {
      if (ctx.roles.includes('Super Admin')) return;
      throw new ForbiddenException(deniedMessage);
    }
    const rows = await this.grants.grantsForUser(ctx.userId);
    const identity: AccessIdentity = {
      userId: ctx.userId,
      verified: true,
      active: true,
      sessionValid: true,
      sessionUserId: ctx.userId,
      superAdmin: ctx.roles.includes('Super Admin'),
    };
    for (const actionId of actionIds) {
      const decision = resolveAccess({ identity, actionId, grants: rows });
      if (!decision.allowed) {
        throw new ForbiddenException(`Sin permiso ${actionId} (${decision.reason ?? 'denegado'})`);
      }
    }
  }

  private assertPreviewActions(ctx: AccessContext): Promise<void> {
    return this.assertActions(ctx, ['prices:preview', 'prices:read', 'listas:read'], 'No tienes asignada la revisión de archivos de precios.');
  }

  private assertSaveActions(ctx: AccessContext): Promise<void> {
    return this.assertActions(ctx, ['prices:save', 'prices:preview', 'prices:read', 'listas:read'], 'No tienes asignado el guardado de revisiones de precios.');
  }

  private assertReviewReadActions(ctx: AccessContext): Promise<void> {
    return this.assertActions(ctx, ['prices:read', 'listas:read'], 'No tienes asignada la consulta de revisiones de precios.');
  }

  private assertApplyActions(ctx: AccessContext): Promise<void> {
    return this.assertActions(ctx, ['prices:apply', 'prices:read', 'listas:read'], 'No tienes asignada la aplicación de precios.');
  }

  /**
   * Authorizes `actionIds` over products of SEVERAL listas with one fresh grant
   * snapshot. Returns the ids the caller may use: a product with a lista needs the
   * actions on that lista; a product WITHOUT a lista needs them with GLOBAL scope.
   */
  async authorizeProductsByLista(
    products: readonly ProductRef[],
    ctx: AccessContext,
    actionIds: readonly string[],
  ): Promise<Set<string>> {
    const access = await this.loadAccess(ctx, actionIds);
    return access.allowedProductIds(products);
  }

  /** Fresh grant snapshot for this request (Super Admin needs none; no grants service denies everyone else). */
  private async loadAccess(
    ctx: AccessContext,
    actionIds: readonly string[],
    unlistedActionIds: readonly string[] = actionIds,
  ): Promise<PriceImportAccess> {
    const rows = !ctx.userId || isSuperAdmin(ctx) ? [] : (await this.grants?.grantsForUser(ctx.userId)) ?? [];
    return new PriceImportAccess(rows, ctx, actionIds, unlistedActionIds);
  }

  /** Preview HTTP: recalcula y emite el evento resumido (separado del historial). */
  async preview(file: Express.Multer.File | undefined, ctx: AccessContext): Promise<PriceImportPreview> {
    await this.assertPreviewActions(ctx);
    const { result, tariffs } = await this.computePreview(file, ctx);
    const fileHash = createHash('sha256').update((file as Express.Multer.File).buffer).digest('hex');
    await this.audit.log({
      userId: ctx.userId, action: 'price-import-preview', entity: 'Price', entityId: fileHash,
      newValues: { fileHash, summary: result.summary, tariffs, rounding: result.rounding },
      result: result.issues.length ? 'WARNING' : 'SUCCESS',
    });
    return result;
  }

  /**
   * Cálculo puro de la revisión (solo lectura: no escribe precios ni productos).
   * Reutilizado por `preview` y por `saveRevision` (IMP-04).
   *
   * R1 (2026-10-20): el archivo se cruza SOLO por SKU, sin lista destino. Cada
   * producto conserva su lista; la autorización se decide por lista (o con alcance
   * global si no tiene lista) y una fila de una lista sin permiso se rechaza sin
   * revelar nombre, id ni precios de esa lista.
   */
  private async computePreview(
    file: Express.Multer.File | undefined,
    ctx: AccessContext,
  ): Promise<{ result: PriceImportPreview; tariffs: PriceImportTariff[]; configured: Map<string, ConfiguredTariff>; snapshots: Map<number, RowSnapshot> }> {
    if (!file?.buffer || !/\.xlsx$/i.test(file.originalname)) throw new BadRequestException('Selecciona la plantilla de Excel guardada como .xlsx.');

    const { tariffs, rows, ignoredColumns } = readPriceTemplate(file.buffer);
    const now = new Date();
    const priceLists = await this.prisma.priceList.findMany({
      where: { code: { in: tariffs } },
      select: { id: true, code: true, isActive: true, currency: true, validFrom: true, validUntil: true },
    });
    const configured = new Map<string, ConfiguredTariff>(priceLists.map((p) => [p.code, p]));
    const issues: PriceImportIssue[] = ignoredColumns.map((column) => ({
      row: null, column, code: 'IGNORED_COLUMN',
      message: 'Esta columna es informativa (precio sin IVA) y no se importa; solo se guardan las tarifas con IVA.',
    }));
    const unavailable = new Set<string>();
    for (const code of tariffs) {
      const tariff = configured.get(code);
      if (!tariff || !tariff.isActive || tariff.currency !== 'COP' ||
        (tariff.validFrom && tariff.validFrom > now) || (tariff.validUntil && tariff.validUntil <= now)) {
        unavailable.add(code);
        issues.push({ row: null, column: code, code: 'TARIFF_UNAVAILABLE',
          message: `La tarifa ${code} no está configurada, activa o vigente en COP. Debe revisarla quien administra las tarifas.` });
      }
    }

    // Normalized global match (same expression as the unique index): case and spaces never matter.
    const skus = [...new Set(rows.filter((r) => !r.issues.some((i) => i.column === 'REFERENCIA')).map((r) => r.sku))];
    const matches = skus.length ? await findProductMatchesBySkus(this.prisma, skus, { id: true, sku: true, listaId: true }) : new Map();
    const single: ProductRef[] = [...matches.values()].filter((c) => c.length === 1).map((c) => c[0] as ProductRef);
    const access = await this.loadAccess(ctx, ['prices:read']);
    const allowedIds = access.allowedProductIds(single);
    const authorized = single.filter((p) => allowedIds.has(p.id));
    // The lista permits prices:read. The only product-level rule that overrides it is an explicit restriction.
    const restrictions = authorized.length && !this.acl.isListasAdmin(ctx.roles)
      ? await this.prisma.assignment.findMany({ where: {
        userId: ctx.userId, resourceType: 'PRODUCT', resourceId: { in: authorized.map((p) => p.id) }, isActive: false,
      }, select: { resourceId: true } }) : [];
    const restricted = new Set(restrictions.map((a: { resourceId: string }) => a.resourceId));
    const listaIds = [...new Set(authorized.map((p) => p.listaId).filter((id): id is string => !!id))];
    const listas = listaIds.length ? await this.prisma.lista.findMany({
      where: { id: { in: listaIds } },
      select: { id: true, code: true, name: true, isActive: true, archivedAt: true, deletionStatus: true, currency: true },
    }) : [];
    const listaById = new Map(listas.map((l) => [l.id, l]));
    const listaUsable = (listaId: string | null) => {
      if (!listaId) return true;
      const lista = listaById.get(listaId);
      return !!lista && lista.isActive && !lista.archivedAt && !lista.deletionStatus && lista.currency === 'COP';
    };
    const usable = authorized.filter((p) => !restricted.has(p.id) && listaUsable(p.listaId));
    const usableIds = new Set(usable.map((p) => p.id));
    const storedPrices = usable.length ? await this.prisma.price.findMany({
      where: { productId: { in: usable.map((p) => p.id) }, priceListId: { in: priceLists.filter((p) => !unavailable.has(p.code)).map((p) => p.id) } },
      select: { productId: true, priceListId: true, listaId: true, value: true, currency: true },
    }) : [];
    const previous = new Map(storedPrices.map((p) => [`${p.productId}:${p.priceListId}`, p]));

    const snapshots = new Map<number, RowSnapshot>();
    const thresholdPct = resolveLargeChangeThresholdPct();
    let inaccessible = 0;
    for (const row of rows) {
      const referenceBroken = row.issues.some((i) => i.column === 'REFERENCIA');
      let product: ProductRef | undefined;
      row.productId = null;
      row.listaId = null;
      row.resolution = null;
      if (row.sku && !referenceBroken) {
        const candidates = (matches.get(normalizeSku(row.sku)) ?? []) as ProductRef[];
        if (candidates.length === 0) {
          row.listaState = 'UNKNOWN';
          row.resolution = 'PENDING_PRODUCT';
          row.issues.push({ row: row.row, column: 'REFERENCIA', code: PRICE_IMPORT_INCIDENCE_CODES.UNKNOWN_REFERENCE,
            message: 'Esta referencia no existe en el catálogo. No se aplicará su precio; el resto del archivo no se bloquea.' });
        } else if (candidates.length > 1) {
          row.issues.push({ row: row.row, column: 'REFERENCIA', code: PRICE_IMPORT_INCIDENCE_CODES.AMBIGUOUS_REFERENCE,
            message: 'Esta referencia coincide con más de un producto y no se puede elegir uno. Debe revisarla quien administra el catálogo.' });
        } else if (!allowedIds.has(candidates[0].id)) {
          // Generic on purpose: no lista name, id, price or "create draft" offer. The snapshot stays internal.
          snapshots.set(row.row, { productId: candidates[0].id, listaId: candidates[0].listaId });
          inaccessible += 1;
          row.issues.push({ row: row.row, column: 'REFERENCIA', code: PRICE_IMPORT_INCIDENCE_CODES.LISTA_FORBIDDEN,
            message: 'Esta referencia pertenece a una lista sobre la que no tienes permiso de precios. No se aplicará su precio.' });
        } else if (restricted.has(candidates[0].id)) {
          snapshots.set(row.row, { productId: candidates[0].id, listaId: candidates[0].listaId });
          row.issues.push({ row: row.row, column: 'REFERENCIA', code: 'REFERENCE_UNAVAILABLE',
            message: 'Esta referencia no está disponible para ti. Revisa su asignación; no se creará ni moverá ningún producto.' });
        } else if (!usableIds.has(candidates[0].id)) {
          snapshots.set(row.row, { productId: candidates[0].id, listaId: candidates[0].listaId });
          row.issues.push({ row: row.row, column: 'REFERENCIA', code: PRICE_IMPORT_INCIDENCE_CODES.LISTA_UNAVAILABLE,
            message: 'La lista de esta referencia no está activa o disponible para revisar precios en pesos colombianos.' });
        } else {
          product = candidates[0];
          row.productId = product.id;
          row.listaId = product.listaId;
          row.listaState = product.listaId ? 'LISTA' : 'SIN_LISTA';
          snapshots.set(row.row, { productId: product.id, listaId: product.listaId });
        }
      }
      for (const price of row.prices) {
        price.changePercent = null;
        price.largeChange = false;
        if (unavailable.has(price.code)) {
          row.issues.push({ row: row.row, column: price.code, code: 'TARIFF_UNAVAILABLE', message: 'Esta tarifa necesita configurarse antes de actualizar sus precios.' });
          continue;
        }
        if (!product || row.issues.some((i) => i.column === 'REFERENCIA')) continue;
        const stored = previous.get(`${product.id}:${configured.get(price.code)!.id}`);
        if (!stored) continue;
        if ((stored.listaId && stored.listaId !== product.listaId) || stored.currency !== 'COP') {
          row.issues.push({ row: row.row, column: price.code, code: 'STORED_PRICE_MISMATCH', message: 'El precio guardado tiene una lista o moneda distinta. Debe revisarlo quien administra los precios.' });
          continue;
        }
        const oldValue = new Prisma.Decimal(stored.value);
        price.previous = oldValue.toFixed();
        price.difference = new Prisma.Decimal(price.rounded).minus(oldValue).toFixed();
        price.change = oldValue.equals(price.rounded) ? 'unchanged' : 'changed';
        // R3: strictly above the threshold (up or down); a zero previous price is always flagged.
        const measure = measurePriceChange(oldValue, price.rounded, thresholdPct);
        price.changePercent = measure.changePercent;
        price.largeChange = measure.largeChange && price.change === 'changed';
      }
      row.status = row.issues.length ? 'error' : 'valid';
    }
    const valid = rows.filter((r) => r.status === 'valid');
    const prices = valid.flatMap((r) => r.prices);
    const perLista = new Map<string, PriceImportListaSummary>();
    for (const row of valid) {
      if (!row.listaId) continue;
      const lista = listaById.get(row.listaId);
      const entry = perLista.get(row.listaId) ?? { listaId: row.listaId, code: lista?.code, name: lista?.name, rows: 0, prices: 0 };
      entry.rows += 1;
      entry.prices += row.prices.length;
      perLista.set(row.listaId, entry);
    }
    const result: PriceImportPreview = {
      listaId: null, fileName: file.originalname.split(/[\\/]/).pop()!.slice(0, 200), currency: 'COP', taxIncluded: true,
      rounding: 'HALF_UP', readOnly: true,
      summary: {
        rows: rows.length, validRows: valid.length, errorRows: rows.length - valid.length,
        prices: prices.length, newPrices: prices.filter((p) => p.change === 'new').length,
        changedPrices: prices.filter((p) => p.change === 'changed').length,
        unchangedPrices: prices.filter((p) => p.change === 'unchanged').length,
        roundedPrices: prices.filter((p) => p.wasRounded).length,
        byLista: [...perLista.values()],
        unlistedRows: rows.filter((r) => r.listaState === 'SIN_LISTA').length,
        unknownRows: rows.filter((r) => r.resolution === 'PENDING_PRODUCT').length,
        rejectedRows: rows.length - valid.length,
        rowsInInaccessibleListas: inaccessible,
        largeChangePrices: prices.filter((p) => p.largeChange).length,
        largeChangeThresholdPct: thresholdPct,
      }, issues: [...issues, ...rows.flatMap((r) => r.issues)], rows,
    };
    return { result, tariffs, configured, snapshots };
  }

  // ————————————————————————————————————————————————————————————————
  // IMP-04 — Revisión comercial de precios guardada (recuperable).
  // ————————————————————————————————————————————————————————————————

  private clampSize(value: number | undefined, fallback: number): number {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return fallback;
    return Math.min(Math.floor(n), 200);
  }

  private clampPage(value: number | undefined): number {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 1) return 1;
    return Math.floor(n);
  }

  private toRevisionHeader(
    revision: {
      id: string; listaId: string | null; status: string; fileName: string; fileHash: string; fileSize: number;
      idempotencyKey: string; policyVersion: string; parserVersion: string; trailerVersion: string | null;
      tariffs: Prisma.JsonValue; summary: Prisma.JsonValue; createdById: string | null; createdAt: Date;
      appliedAt: Date | null; appliedResult: Prisma.JsonValue | null;
    },
    fileAvailable: boolean,
    access?: PriceImportAccess,
  ): PriceImportRevisionHeader {
    const summary = revision.summary as unknown as PriceImportPreview['summary'];
    const applied = (revision.appliedResult as unknown as PriceImportRevisionApplyResult | null) ?? null;
    return {
      id: revision.id,
      listaId: revision.listaId,
      status: revision.status as PriceImportRevisionHeader['status'],
      fileName: revision.fileName,
      fileHash: revision.fileHash,
      fileSize: revision.fileSize,
      fileAvailable,
      idempotencyKey: revision.idempotencyKey,
      currency: 'COP',
      taxIncluded: true,
      rounding: 'HALF_UP',
      policyVersion: revision.policyVersion,
      parserVersion: revision.parserVersion,
      trailerVersion: revision.trailerVersion,
      tariffs: (revision.tariffs as unknown as PriceImportRevisionTariff[]) ?? [],
      summary: access ? this.summaryForViewer(summary, access) : summary,
      createdById: revision.createdById,
      createdAt: revision.createdAt.toISOString(),
      appliedAt: revision.appliedAt ? revision.appliedAt.toISOString() : null,
      appliedResult: applied && access ? this.appliedResultForViewer(applied, access) : applied,
    };
  }

  /** Names and counts of listas the viewer cannot read never leave the server: they fold into one counter. */
  private summaryForViewer(summary: PriceImportPreview['summary'], access: PriceImportAccess): PriceImportPreview['summary'] {
    if (!summary || !Array.isArray(summary.byLista)) return summary;
    const visible = summary.byLista.filter((l) => access.allowsLista(l.listaId));
    const hiddenRows = summary.byLista.filter((l) => !access.allowsLista(l.listaId)).reduce((sum, l) => sum + l.rows, 0);
    return { ...summary, byLista: visible, rowsInInaccessibleListas: (summary.rowsInInaccessibleListas ?? 0) + hiddenRows };
  }

  private appliedResultForViewer(result: PriceImportRevisionApplyResult, access: PriceImportAccess): PriceImportRevisionApplyResult {
    if (!Array.isArray(result.perLista)) return result;
    return { ...result, perLista: result.perLista.filter((l) => (l.listaId ? access.allowsLista(l.listaId) : access.allowsUnlistedProduct(UNLISTED_SENTINEL))) };
  }

  /**
   * Guarda la revisión (archivo + filas + precios) en UNA transacción. NO toca
   * `Price`, `Product` ni identidad (regla 3). Idempotente por `idempotencyKey`
   * Y creador: otra persona con la misma clave y archivo nunca recibe la cabecera ajena.
   *
   * `revision.listaId` queda SIEMPRE null en las revisiones nuevas: la verdad es la
   * lista de cada fila (instantánea `listaId`), porque un archivo puede mezclar listas.
   */
  async saveRevision(
    file: Express.Multer.File | undefined,
    idempotencyKey: string | undefined,
    ctx: AccessContext,
  ): Promise<PriceImportRevisionHeader> {
    await this.assertSaveActions(ctx);
    if (!idempotencyKey || typeof idempotencyKey !== 'string' || idempotencyKey.trim().length < 8) {
      throw new BadRequestException('Falta una clave de idempotencia válida para guardar la revisión.');
    }
    if (!file?.buffer) {
      throw new BadRequestException('Selecciona la plantilla de Excel guardada como .xlsx.');
    }
    const key = idempotencyKey.trim();
    // Recalcula en servidor: nunca se confía en filas/precios del navegador.
    const { result, tariffs, configured, snapshots } = await this.computePreview(file, ctx);
    const fileHash = createHash('sha256').update(file.buffer).digest('hex');

    const existing = await this.prisma.priceImportRevision.findUnique({ where: { idempotencyKey: key } });
    if (existing) {
      if (existing.fileHash === fileHash && existing.createdById === (ctx.userId ?? null)) {
        const access = await this.loadAccess(ctx, ['prices:read']);
        return this.toRevisionHeader(existing, await priceImportFileExists(existing.fileHash), access);
      }
      throw new ConflictException('La clave de idempotencia ya se usó con otro contenido o por otra persona.');
    }

    const tariffSnapshot: PriceImportRevisionTariff[] = tariffs.map((code) => {
      const t = configured.get(code);
      return {
        code,
        priceListId: t?.id ?? null,
        validFrom: t?.validFrom ? t.validFrom.toISOString() : null,
        validUntil: t?.validUntil ? t.validUntil.toISOString() : null,
      };
    });

    await storePriceImportFile(fileHash, file.buffer);
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const revision = await tx.priceImportRevision.create({
          data: {
            listaId: null,
            createdById: ctx.userId ?? null,
            fileName: result.fileName,
            fileHash,
            fileSize: file.buffer.length,
            storagePath: null,
            idempotencyKey: key,
            currency: 'COP',
            taxIncluded: true,
            rounding: 'HALF_UP',
            policyVersion: COP_POLICY_VERSION,
            parserVersion: PRICE_IMPORT_PARSER_VERSION,
            trailerVersion: PRICE_IMPORT_TRAILER_VERSION,
            tariffs: tariffSnapshot as unknown as Prisma.InputJsonValue,
            summary: result.summary as unknown as Prisma.InputJsonValue,
          },
        });
        if (result.rows.length) {
          await tx.priceImportRevisionRow.createMany({
            data: result.rows.map((r) => ({
              revisionId: revision.id,
              rowNumber: r.row,
              sku: r.sku,
              status: r.status,
              issues: r.issues as unknown as Prisma.InputJsonValue,
              productId: snapshots.get(r.row)?.productId ?? null,
              listaId: snapshots.get(r.row)?.listaId ?? null,
              resolution: r.resolution ?? null,
            })),
          });
        }
        const priceRows = result.rows.flatMap((r) =>
          r.prices.map((p) => ({
            revisionId: revision.id,
            rowNumber: r.row,
            sku: r.sku,
            tariffCode: p.code,
            priceListId: configured.get(p.code)?.id ?? null,
            receivedValue: p.raw,
            roundedValue: p.rounded,
            previousValue: p.previous,
            difference: p.difference,
            wasRounded: p.wasRounded,
            change: p.change,
            productId: snapshots.get(r.row)?.productId ?? null,
            changePercent: clampChangePercentForStorage(p.changePercent),
            largeChange: p.largeChange === true,
          })),
        );
        if (priceRows.length) {
          await tx.priceImportRevisionPrice.createMany({ data: priceRows });
        }
        return revision;
      });
      await this.audit.log({
        userId: ctx.userId,
        action: 'price-import-revision-save',
        entity: 'Price',
        entityId: created.id,
        newValues: { revisionId: created.id, fileHash, summary: result.summary, tariffs: tariffSnapshot, policyVersion: COP_POLICY_VERSION },
        result: result.issues.length ? 'WARNING' : 'SUCCESS',
      });
      return this.toRevisionHeader(created, true);
    } catch (error) {
      // Fallo intermedio: no deja datos comerciales parciales; limpia el archivo.
      await deletePriceImportFile(fileHash).catch(() => undefined);
      throw error;
    }
  }

  /**
   * Revisions that have rows in `listaId` (join on the row snapshot) plus legacy
   * ones created for that single lista. The caller needs prices:read on `listaId`;
   * the other listas of a mixed revision are folded into a counter in each header.
   */
  async listRevisions(listaId: string, page: number, pageSize: number, ctx: AccessContext): Promise<PriceImportRevisionPage> {
    await this.assertReviewReadActions(ctx);
    await this.acl.assertListaAccess(listaId, ctx, 'view_prices');
    const take = this.clampSize(pageSize, REVISION_PAGE_SIZE);
    const currentPage = this.clampPage(page);
    const where = { OR: [{ listaId }, { rows: { some: { listaId } } }] };
    const [items, total] = await Promise.all([
      this.prisma.priceImportRevision.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (currentPage - 1) * take, take }),
      this.prisma.priceImportRevision.count({ where }),
    ]);
    const access = await this.loadAccess(ctx, ['prices:read']);
    const withFile = await Promise.all(items.map(async (r) => this.toRevisionHeader(r, await priceImportFileExists(r.fileHash), access)));
    return { items: withFile, total, page: currentPage, pageSize: take };
  }

  /** Which lista a stored row belongs to (legacy rows have no snapshot and take the revision's lista). */
  private rowOwner(row: { productId?: string | null; listaId?: string | null }, revisionListaId: string | null): { listaId: string | null; productId: string | null } {
    if (row.productId) return { listaId: row.listaId ?? null, productId: row.productId };
    return { listaId: row.listaId ?? revisionListaId, productId: null };
  }

  /** A row is visible when the caller can read its lista (or the row is tied to no product at all). */
  private canSeeRow(row: { productId?: string | null; listaId?: string | null }, revisionListaId: string | null, access: PriceImportAccess): boolean {
    const owner = this.rowOwner(row, revisionListaId);
    if (owner.listaId) return access.allowsLista(owner.listaId);
    if (owner.productId) return access.allowsUnlistedProduct(owner.productId);
    return true;
  }

  async getRevision(id: string, page: number, pageSize: number, ctx: AccessContext): Promise<PriceImportRevisionDetail> {
    await this.assertReviewReadActions(ctx);
    const revision = await this.prisma.priceImportRevision.findUnique({ where: { id } });
    if (!revision) throw new NotFoundException('Revisión de precios no encontrada.');
    // Legacy revision of one lista: the original lista-level gate still applies.
    if (revision.listaId) await this.acl.assertListaAccess(revision.listaId, ctx, 'view_prices');
    const access = await this.loadAccess(ctx, ['prices:read']);
    const take = this.clampSize(pageSize, REVISION_ROWS_PAGE_SIZE);
    const currentPage = this.clampPage(page);

    const allRows = await this.prisma.priceImportRevisionRow.findMany({ where: { revisionId: id }, orderBy: { rowNumber: 'asc' } });
    const visible = allRows.filter((r) => this.canSeeRow(r, revision.listaId, access));
    const hidden = allRows.length - visible.length;
    if (hidden > 0 && visible.length === 0 && revision.createdById !== (ctx.userId ?? null)) {
      throw new ForbiddenException('Sin permiso sobre las listas de esta revisión.');
    }
    const pageRows = visible.slice((currentPage - 1) * take, currentPage * take);
    const visibleNumbers = new Set(visible.map((r) => r.rowNumber));
    const prices = (await this.prisma.priceImportRevisionPrice.findMany({ where: { revisionId: id } })).filter((p) => visibleNumbers.has(p.rowNumber));
    const byRow = new Map<string, typeof prices>();
    for (const price of prices) {
      const key = `${price.rowNumber}:${price.sku}`;
      byRow.set(key, [...(byRow.get(key) ?? []), price]);
    }
    const view: PriceImportRow[] = pageRows.map((r) => {
      const owner = this.rowOwner(r, revision.listaId);
      const resolution = (r.resolution ?? null) as PriceImportRow['resolution'];
      return {
        row: r.rowNumber,
        sku: r.sku,
        status: r.status as 'valid' | 'error',
        issues: (r.issues as unknown as PriceImportIssue[]) ?? [],
        productId: owner.productId,
        listaId: owner.listaId,
        listaState: owner.listaId ? 'LISTA' : owner.productId ? 'SIN_LISTA' : resolution === 'PENDING_PRODUCT' ? 'UNKNOWN' : undefined,
        resolution,
        prices: (byRow.get(`${r.rowNumber}:${r.sku}`) ?? []).map((p) => ({
          code: p.tariffCode,
          raw: p.receivedValue,
          rounded: p.roundedValue,
          previous: p.previousValue,
          difference: p.difference,
          wasRounded: p.wasRounded,
          change: p.change as 'new' | 'changed' | 'unchanged',
          changePercent: p.changePercent === null || p.changePercent === undefined ? null : new Prisma.Decimal(p.changePercent).toFixed(2),
          largeChange: p.largeChange === true,
        })),
      };
    });

    const perLista = new Map<string, PriceImportListaSummary>();
    for (const r of visible) {
      const owner = this.rowOwner(r, revision.listaId);
      if (!owner.listaId) continue;
      const entry = perLista.get(owner.listaId) ?? { listaId: owner.listaId, rows: 0, prices: 0 };
      entry.rows += 1;
      entry.prices += prices.filter((p) => p.rowNumber === r.rowNumber).length;
      perLista.set(owner.listaId, entry);
    }
    const listas = perLista.size ? await this.prisma.lista.findMany({ where: { id: { in: [...perLista.keys()] } }, select: { id: true, code: true, name: true } }) : [];
    for (const lista of listas) {
      const entry = perLista.get(lista.id);
      if (entry) { entry.code = lista.code; entry.name = lista.name; }
    }
    return {
      ...this.toRevisionHeader(revision, await priceImportFileExists(revision.fileHash), access),
      rows: view, byLista: [...perLista.values()], rowsInInaccessibleListas: hidden,
      totalRows: visible.length, page: currentPage, pageSize: take,
    };
  }

  /**
   * Gate for the original file and for discarding: a legacy revision keeps its lista
   * check; a mixed one needs prices:read on EVERY lista it touches, unless the caller
   * is the person who uploaded it (it is their own file).
   */
  private async assertWholeRevisionAccess(revision: { id: string; listaId: string | null; createdById: string | null }, ctx: AccessContext): Promise<void> {
    if (revision.listaId) {
      await this.acl.assertListaAccess(revision.listaId, ctx, 'view_prices');
      return;
    }
    if (revision.createdById && revision.createdById === ctx.userId) return;
    const access = await this.loadAccess(ctx, ['prices:read']);
    const rows = await this.prisma.priceImportRevisionRow.findMany({ where: { revisionId: revision.id } });
    if (rows.some((r) => !this.canSeeRow(r, null, access))) {
      throw new ForbiddenException('Sin permiso sobre las listas de esta revisión.');
    }
  }

  /**
   * Revision gate for the unknown-SKU resolution endpoints: `prices:read` + `listas:read`, then the
   * same whole-revision rule as the original file (creator, or `prices:read` on every lista it touches).
   */
  async loadRevisionForResolution(id: string, ctx: AccessContext) {
    await this.assertReviewReadActions(ctx);
    const revision = await this.prisma.priceImportRevision.findUnique({ where: { id } });
    if (!revision) throw new NotFoundException('Revisión de precios no encontrada.');
    await this.assertWholeRevisionAccess(revision, ctx);
    return revision;
  }

  /** Whether the caller may create hidden drafts from a price import: `products:write` AND `prices:apply`, both GLOBAL. */
  async canCreateDrafts(ctx: AccessContext): Promise<boolean> {
    const access = await this.loadAccess(ctx, ['prices:read'], ['prices:apply', 'products:write']);
    return access.allowsUnlistedProduct('new-product-draft');
  }

  async getRevisionFile(id: string, ctx: AccessContext): Promise<{ buffer: Buffer; fileName: string }> {
    await this.assertReviewReadActions(ctx);
    const revision = await this.prisma.priceImportRevision.findUnique({ where: { id } });
    if (!revision) throw new NotFoundException('Revisión de precios no encontrada.');
    await this.assertWholeRevisionAccess(revision, ctx);
    const buffer = await readPriceImportFile(revision.fileHash);
    if (!buffer) throw new NotFoundException('El archivo original de esta revisión ya no está disponible.');
    return { buffer, fileName: revision.fileName };
  }

  async discardRevision(id: string, ctx: AccessContext): Promise<PriceImportRevisionHeader> {
    await this.assertSaveActions(ctx);
    const revision = await this.prisma.priceImportRevision.findUnique({ where: { id } });
    if (!revision) throw new NotFoundException('Revisión de precios no encontrada.');
    await this.assertWholeRevisionAccess(revision, ctx);
    if (revision.status !== 'GUARDADA') {
      throw new ConflictException('Solo se puede descartar una revisión que sigue pendiente de aplicar.');
    }
    const updated = await this.prisma.priceImportRevision.update({ where: { id }, data: { status: 'DESCARTADA' } });
    await deletePriceImportFile(revision.fileHash).catch(() => undefined);
    await this.audit.log({
      userId: ctx.userId,
      action: 'price-import-revision-discard',
      entity: 'Price',
      entityId: id,
      oldValues: { status: revision.status },
      newValues: { revisionId: id, status: 'DESCARTADA' },
      result: 'SUCCESS',
    });
    return this.toRevisionHeader(updated, false);
  }

  /** Prisma serialization failure (P2034), also surfaced as a raw-query failure with SQLSTATE 40001. */
  private isSerializationFailure(error: unknown): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
    if (error.code === 'P2034') return true;
    return error.code === 'P2010' && /40001|could not serialize/i.test(`${error.message} ${JSON.stringify(error.meta ?? {})}`);
  }

  /** Result of an already applied revision, with lista names the caller cannot read removed. */
  private async replayApplied(revision: { id: string; appliedAt: Date | null; appliedResult: Prisma.JsonValue | null }, ctx: AccessContext): Promise<PriceImportRevisionApplyResult> {
    const stored = revision.appliedResult as unknown as PriceImportRevisionApplyResult | null;
    const result: PriceImportRevisionApplyResult = stored ? { ...stored, alreadyApplied: true } : {
      revisionId: revision.id, status: 'APLICADA', alreadyApplied: true, appliedRows: 0, appliedPrices: 0, tariffs: [], appliedAt: revision.appliedAt?.toISOString() ?? '',
    };
    return this.appliedResultForViewer(result, await this.loadAccess(ctx, ['prices:read']));
  }

  /**
   * IMP-05 — Aplica la revisión de forma atómica: UNA transacción `Serializable`
   * que reclama la revisión, valida permisos por lista, confirmaciones y versiones
   * esperadas, bloquea los productos, escribe SOLO `Price` y deja el historial por
   * producto y la auditoría en la misma transacción. No toca `Product`/identidad.
   *
   * - Solo se aplican las filas válidas; las rechazadas no bloquean, pero la persona
   *   debe confirmar su número exacto (`acknowledgeRejectedRows`).
   * - Los cambios grandes exigen `confirmLargeChanges`.
   * - `prices:apply` se exige sobre CADA lista de las filas a escribir (alcance global
   *   para productos sin lista); si se perdió desde la revisión, 409 `LISTA_ACCESS_CHANGED`.
   * - Dos aplicaciones simultáneas: la perdedora recibe el resultado guardado
   *   (`alreadyApplied`) tras reintentar un fallo de serialización (P2034).
   */
  async applyRevision(id: string, ctx: AccessContext, options: PriceImportApplyOptions = {}): Promise<PriceImportRevisionApplyResult> {
    await this.assertApplyActions(ctx);
    const revision = await this.prisma.priceImportRevision.findUnique({ where: { id } });
    if (!revision) throw new NotFoundException('Revisión de precios no encontrada.');
    if (revision.status === 'APLICADA') return this.replayApplied(revision, ctx);
    if (revision.status !== 'GUARDADA') {
      throw new ConflictException({ code: 'REVISION_DISCARDED', message: 'Esta revisión fue descartada y no se puede aplicar.' });
    }

    for (let attempt = 1; ; attempt++) {
      try {
        const outcome = await this.applyOnce(revision, ctx, options);
        return 'revision' in outcome ? this.replayApplied(outcome.revision, ctx) : outcome.result;
      } catch (error) {
        if (!this.isSerializationFailure(error)) throw error;
        if (attempt >= APPLY_MAX_ATTEMPTS) {
          throw new ConflictException({
            code: PRICE_IMPORT_APPLY_CODES.APPLY_SERIALIZATION_CONFLICT,
            message: 'Otra operación modificó estos precios al mismo tiempo. Vuelve a intentar aplicar la revisión.',
          });
        }
      }
    }
  }

  private async applyOnce(
    revision: { id: string; listaId: string | null },
    ctx: AccessContext,
    options: PriceImportApplyOptions,
  ): Promise<{ replayed: true; revision: { id: string; appliedAt: Date | null; appliedResult: Prisma.JsonValue | null } } | { replayed: false; result: PriceImportRevisionApplyResult }> {
    const id = revision.id;
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      // Claim first: a concurrent apply either waits and replays the stored result or fails serialization and retries.
      const claim = await tx.priceImportRevision.updateMany({
        where: { id, status: 'GUARDADA' },
        data: { status: 'APLICADA', appliedAt: now, appliedById: ctx.userId ?? null },
      });
      if (claim.count === 0) {
        const current = await tx.priceImportRevision.findUnique({ where: { id } });
        if (!current) throw new NotFoundException('Revisión de precios no encontrada.');
        if (current.status === 'APLICADA') return { replayed: true as const, revision: current };
        throw new ConflictException({ code: 'REVISION_DISCARDED', message: 'Esta revisión fue descartada y no se puede aplicar.' });
      }

      const rows = await tx.priceImportRevisionRow.findMany({ where: { revisionId: id }, orderBy: { rowNumber: 'asc' } });
      const storedPrices = await tx.priceImportRevisionPrice.findMany({ where: { revisionId: id } });
      const validByKey = new Map(rows.filter((r) => r.status === 'valid').map((r) => [`${r.rowNumber}:${r.sku}`, r]));
      const rejected = rows.filter((r) => r.status !== 'valid');
      const targets = storedPrices.filter((p) => validByKey.has(`${p.rowNumber}:${p.sku}`) && p.change !== 'unchanged');
      const unchangedPrices = storedPrices.filter((p) => validByKey.has(`${p.rowNumber}:${p.sku}`) && p.change === 'unchanged').length;

      // Owner of every row to write: the stored snapshot, or (legacy single-lista rows) the SKU in the revision's lista.
      const legacyRows = [...new Set(targets.filter((t) => !validByKey.get(`${t.rowNumber}:${t.sku}`)!.productId).map((t) => t.sku))];
      const legacyMatches = legacyRows.length
        ? await findProductMatchesBySkus(tx, legacyRows, { id: true, sku: true, listaId: true })
        : new Map();
      const ownerOf = (rowNumber: number, sku: string): { productId: string; listaId: string | null } | null => {
        const row = validByKey.get(`${rowNumber}:${sku}`)!;
        if (row.productId) return { productId: row.productId, listaId: row.listaId ?? null };
        const candidates = legacyMatches.get(normalizeSku(sku)) ?? [];
        return candidates.length === 1 ? { productId: candidates[0].id, listaId: revision.listaId } : null;
      };

      // 1. Permission on EVERY lista (or global scope for products without lista) that will be written.
      const access = await this.loadAccess(ctx, ['prices:apply'], ['prices:apply', 'products:write']);
      const owners = new Map<string, { productId: string; listaId: string | null } | null>();
      for (const t of targets) owners.set(`${t.rowNumber}:${t.sku}`, ownerOf(t.rowNumber, t.sku));
      for (const owner of owners.values()) {
        if (owner && !access.allows({ id: owner.productId, listaId: owner.listaId })) {
          throw new ConflictException({
            code: PRICE_IMPORT_APPLY_CODES.REVISION_CONFLICT,
            message: 'Ya no tienes permiso para aplicar precios en una de las listas de esta revisión. No se aplicó nada.',
            details: { reason: PRICE_IMPORT_APPLY_CODES.LISTA_ACCESS_CHANGED },
            reason: PRICE_IMPORT_APPLY_CODES.LISTA_ACCESS_CHANGED,
          });
        }
      }

      // 2. Something to write.
      if (targets.length === 0) {
        throw new ConflictException({
          code: PRICE_IMPORT_APPLY_CODES.NOTHING_TO_APPLY,
          message: 'La revisión no tiene filas válidas con cambios de precio para aplicar.',
          details: { rejectedRows: rejected.length, unchangedPrices },
        });
      }

      // 3. The person must confirm exactly how many rejected rows stay unapplied.
      const acknowledged = options.acknowledgeRejectedRows;
      if ((rejected.length > 0 && acknowledged === undefined) || (acknowledged !== undefined && acknowledged !== rejected.length)) {
        const shown = rejected.filter((r) => {
          const lista = r.productId ? r.listaId ?? null : r.listaId ?? revision.listaId;
          return lista ? access.allowsLista(lista) : true;
        });
        const list = shown.slice(0, COMPACT_LIST_LIMIT).map((r) => ({
          rowNumber: r.rowNumber, sku: r.sku, code: ((r.issues as unknown as Array<{ code?: string }> | null)?.[0]?.code) ?? 'REJECTED',
        }));
        throw new ConflictException({
          code: PRICE_IMPORT_APPLY_CODES.REJECTED_ROWS_UNACKNOWLEDGED,
          message: `La revisión tiene ${rejected.length} fila(s) rechazada(s) que no se aplicarán. Confirma ese número para continuar.`,
          feedback: list.map((r) => `Fila ${r.rowNumber} (${r.sku}): ${r.code}`),
          details: { count: rejected.length, rows: list, hiddenRows: rejected.length - shown.length, truncated: shown.length > list.length },
        });
      }

      // 4. Large changes need an explicit confirmation in this same call.
      const large = targets.filter((t) => t.largeChange === true);
      if (large.length > 0 && options.confirmLargeChanges !== true) {
        const list = large.slice(0, COMPACT_LIST_LIMIT).map((t) => ({
          sku: t.sku, tariffCode: t.tariffCode, previous: t.previousValue, new: t.roundedValue,
          percent: t.changePercent === null || t.changePercent === undefined ? null : new Prisma.Decimal(t.changePercent).toFixed(2),
        }));
        throw new ConflictException({
          code: PRICE_IMPORT_APPLY_CODES.LARGE_CHANGES_UNCONFIRMED,
          message: `La revisión tiene ${large.length} cambio(s) de precio grande(s). Confírmalos para continuar.`,
          feedback: list.map((c) => `${c.sku} · ${c.tariffCode}: ${c.previous ?? '—'} → ${c.new} (${c.percent ?? 'sin porcentaje'}%)`),
          details: { count: large.length, changes: list, truncated: large.length > list.length },
        });
      }

      // 5. Lock the products (same pattern as the product import) so a concurrent lista change cannot slip in.
      const productIds = [...new Set([...owners.values()].filter((o): o is { productId: string; listaId: string | null } => !!o).map((o) => o.productId))].sort();
      const locked = productIds.length
        ? await tx.$queryRaw<Array<{ id: string; sku: string; listaId: string | null }>>(
          Prisma.sql`SELECT id, sku, "listaId" FROM products WHERE id = ANY(${productIds}::text[]) ORDER BY id FOR UPDATE`)
        : [];
      const lockedById = new Map(locked.map((p) => [p.id, p]));
      const currentPrices = productIds.length
        ? await tx.price.findMany({ where: { productId: { in: productIds } }, select: { id: true, productId: true, priceListId: true, value: true } })
        : [];
      const currentByKey = new Map(currentPrices.map((c) => [`${c.productId}:${c.priceListId}`, c]));

      const conflicts: PriceImportRevisionApplyConflict[] = [];
      const planned: Array<{ productId: string; productSku: string; listaId: string | null; priceListId: string; value: string; previous: string | null; code: string; sku: string; rowNumber: number }> = [];
      for (const t of targets) {
        const owner = owners.get(`${t.rowNumber}:${t.sku}`);
        const product = owner ? lockedById.get(owner.productId) : undefined;
        if (!owner || !product || (product.listaId ?? null) !== owner.listaId) {
          conflicts.push({ code: 'MEMBERSHIP_CHANGED', sku: t.sku, tariffCode: t.tariffCode, expected: owner?.listaId ?? 'sin lista', actual: 'la lista del producto cambió o ya no existe' });
          continue;
        }
        if (!t.priceListId) {
          conflicts.push({ code: 'TARIFF_UNAVAILABLE', sku: t.sku, tariffCode: t.tariffCode, expected: 'tarifa configurada', actual: 'no configurada' });
          continue;
        }
        // Defensa en profundidad (IMP-03): el valor a escribir se revalida antes.
        const value = normalizeCopPrice(t.roundedValue).rounded;
        const current = currentByKey.get(`${product.id}:${t.priceListId}`);
        const currentStr = current ? current.value.toString() : null;
        if (t.previousValue === null && current) {
          conflicts.push({ code: 'PRICE_CREATED_ELSEWHERE', sku: t.sku, tariffCode: t.tariffCode, expected: null, actual: currentStr });
        } else if (t.previousValue !== null && !current) {
          conflicts.push({ code: 'PRICE_REMOVED', sku: t.sku, tariffCode: t.tariffCode, expected: t.previousValue, actual: null });
        } else if (current && t.previousValue !== null && !new Prisma.Decimal(current.value).equals(t.previousValue)) {
          conflicts.push({ code: 'PRICE_CHANGED', sku: t.sku, tariffCode: t.tariffCode, expected: t.previousValue, actual: currentStr });
        } else {
          planned.push({ productId: product.id, productSku: product.sku, listaId: product.listaId ?? null, priceListId: t.priceListId, value, previous: t.previousValue, code: t.tariffCode, sku: t.sku, rowNumber: t.rowNumber });
        }
      }
      if (conflicts.length) {
        throw new ConflictException({
          code: PRICE_IMPORT_APPLY_CODES.REVISION_CONFLICT,
          message: 'La revisión ya no coincide con los precios o la configuración vigentes. No se aplicó nada.',
          feedback: conflicts.map((c) => `${c.sku} · ${c.tariffCode}: ${c.code} (esperado ${c.expected ?? '—'}, actual ${c.actual ?? '—'})`),
          conflicts,
          details: { conflicts },
        });
      }

      // 6. Write prices (Price.listaId follows the product's CURRENT lista, which may be null) and their history.
      const batchId = newBatchId();
      const history: ProductChangeInput[] = [];
      for (const p of planned) {
        const current = currentByKey.get(`${p.productId}:${p.priceListId}`);
        const data = { value: new Prisma.Decimal(p.value), currency: 'COP', listaId: p.listaId };
        if (current) {
          await tx.price.update({ where: { id: current.id }, data });
        } else {
          await tx.price.create({ data: { productId: p.productId, priceListId: p.priceListId, ...data } });
        }
        const field = `${PRICE_FIELD_PREFIX}${p.code}`;
        history.push(...diffFields(current ? { [field]: new Prisma.Decimal(current.value) } : {}, { [field]: data.value }, [field], {
          productId: p.productId, sku: p.productSku, source: 'PRICE_IMPORT', sourceRef: id, actorId: ctx.userId ?? null, batchId,
        }));
      }
      await this.changes.record(tx, history);

      // 7. Result, per-lista breakdown and audit, still inside the transaction.
      const groups = new Map<string | null, { rows: Set<number>; prices: number }>();
      for (const p of planned) {
        const group = groups.get(p.listaId) ?? { rows: new Set<number>(), prices: 0 };
        group.rows.add(p.rowNumber);
        group.prices += 1;
        groups.set(p.listaId, group);
      }
      const listaIds = [...groups.keys()].filter((k): k is string => !!k);
      const listas = listaIds.length ? await tx.lista.findMany({ where: { id: { in: listaIds } }, select: { id: true, code: true, name: true } }) : [];
      const listaById = new Map(listas.map((l) => [l.id, l]));
      const perLista: PriceImportApplyPerLista[] = [...groups.entries()].map(([listaId, g]) => ({
        listaId, code: listaId ? listaById.get(listaId)?.code : undefined, name: listaId ? listaById.get(listaId)?.name : undefined, rows: g.rows.size, prices: g.prices,
      }));
      const result: PriceImportRevisionApplyResult = {
        revisionId: id,
        status: 'APLICADA',
        alreadyApplied: false,
        appliedRows: new Set(planned.map((p) => p.rowNumber)).size,
        appliedPrices: planned.length,
        tariffs: [...new Set(planned.map((p) => p.code))],
        appliedAt: now.toISOString(),
        unchangedPrices,
        rejectedRows: rejected.length,
        largeChangesConfirmed: large.length > 0 && options.confirmLargeChanges === true,
        perLista,
        batchId,
      };
      await tx.priceImportRevision.update({ where: { id }, data: { appliedResult: result as unknown as Prisma.InputJsonValue } });
      await this.audit.logTx(tx, {
        userId: ctx.userId,
        action: 'price-import-apply',
        entity: 'Price',
        entityId: id,
        newValues: {
          revisionId: id, appliedRows: result.appliedRows, appliedPrices: result.appliedPrices, unchangedPrices, tariffs: result.tariffs,
          rejectedRows: rejected.length, largeChangesConfirmed: result.largeChangesConfirmed,
          perLista: perLista.map((l) => ({ listaId: l.listaId, rows: l.rows, prices: l.prices })), batchId,
        },
        result: 'SUCCESS',
      });
      return { replayed: false as const, result };
    }, APPLY_TX_OPTIONS);
  }

  /** ¿Concede `actionId` el usuario según sus grants vigentes? (legados sin grants → true, transición D5). */
  private async concede(actionId: string, ctx: AccessContext): Promise<boolean> {
    if (!ctx.userId) return false;
    const rows = (await this.grants?.grantsForUser(ctx.userId)) ?? [];
    if (rows.length === 0) return true; // transición D5: capa rol del controller
    const identity: AccessIdentity = {
      userId: ctx.userId,
      verified: true,
      active: true,
      sessionValid: true,
      sessionUserId: ctx.userId,
      superAdmin: ctx.roles.includes('Super Admin'),
    };
    return resolveAccess({ identity, actionId, grants: rows }).allowed;
  }

  /**
   * IMP-02 §3 — descarga de plantilla (archivo NUEVO, jamás el del usuario).
   * mode=vacias: solo encabezados. mode=referencias: SKUs de ESA lista; los
   * precios actuales se incluyen SOLO con la concesión `prices:read` (P1).
   */
  async downloadTemplate(
    listaId: string,
    mode: 'vacias' | 'referencias',
    tariffsInput: string[] | undefined,
    ctx: AccessContext,
  ): Promise<{ buffer: Buffer; fileName: string }> {
    if (mode !== 'vacias' && mode !== 'referencias') {
      throw new BadRequestException('mode debe ser "vacias" o "referencias".');
    }
    const tariffs = this.normalizeTariffs(tariffsInput);

    // §3: vacía exige prices:preview; con referencias exige prices:read.
    const requiredAction = mode === 'vacias' ? 'prices:preview' : 'prices:read';
    if (!(await this.concede(requiredAction, ctx))) {
      throw new ForbiddenException(`Sin permiso ${requiredAction}`);
    }
    const lista = await this.requireLista(listaId, ctx);

    const references = mode === 'referencias' ? await this.collectListaReferences(listaId, tariffs, ctx) : [];
    const buffer = buildPriceTemplate({ mode, tariffs, references });
    const stamp = new Date().toISOString().slice(0, 10);
    const fileName = `plantilla-precios-${lista.code}-${stamp}.xlsx`;
    await this.audit.log({
      userId: ctx.userId,
      action: 'price-template-download',
      entity: 'LISTA',
      entityId: listaId,
      newValues: {
        mode,
        tariffs,
        fileHash: createHash('sha256').update(buffer).digest('hex'),
      },
      result: 'SUCCESS',
    });
    return { buffer, fileName };
  }

  /**
   * IMP-07 §3 (07A) — Exportación de la lista. Archivo NUEVO con las referencias
   * de ESA lista y los precios VIGENTES de las tarifas autorizadas. Exige
   * `prices:read` y `assertListaAccess`; no cambia precios ni identidad.
   */
  async exportListaPrices(
    listaId: string,
    tariffsInput: string[] | undefined,
    ctx: AccessContext,
  ): Promise<{ buffer: Buffer; fileName: string }> {
    const tariffs = this.normalizeTariffs(tariffsInput);
    if (!(await this.concede('prices:read', ctx))) {
      throw new ForbiddenException('Sin permiso prices:read');
    }
    const lista = await this.requireLista(listaId, ctx);
    const references = await this.collectListaReferences(listaId, tariffs, ctx);
    const buffer = buildPriceTemplate({ mode: 'referencias', tariffs, references });
    const stamp = new Date().toISOString().slice(0, 10);
    const fileName = `lista-${lista.code}-${stamp}.xlsx`;
    await this.audit.log({
      userId: ctx.userId,
      action: 'price-list-export',
      entity: 'LISTA',
      entityId: listaId,
      newValues: {
        tariffs,
        fileHash: createHash('sha256').update(buffer).digest('hex'),
      },
      result: 'SUCCESS',
    });
    return { buffer, fileName };
  }

  /** Normaliza y valida las tarifas solicitadas (orden canónico, sin repetidas). */
  private normalizeTariffs(tariffsInput: string[] | undefined): PriceImportTariff[] {
    const requested = (tariffsInput ?? [...PRICE_IMPORT_TARIFFS])
      .map((t) => t.trim())
      .filter((t) => t !== '');
    const invalid = requested.filter((t) => !(PRICE_IMPORT_TARIFFS as readonly string[]).includes(t));
    if (invalid.length > 0) {
      throw new BadRequestException(`Tarifa no reconocida: ${invalid.join(', ')}.`);
    }
    const tariffs: PriceImportTariff[] = PRICE_IMPORT_TARIFFS.filter((code) => requested.includes(code));
    if (tariffs.length === 0) throw new BadRequestException('Selecciona al menos una tarifa válida.');
    return tariffs;
  }

  /** Lista autorizada para operar precios, o 404/403. Compartido por plantilla y exportación. */
  private async requireLista(listaId: string, ctx: AccessContext) {
    const lista = await this.prisma.lista.findUnique({
      where: { id: listaId },
      select: { id: true, code: true, isActive: true, archivedAt: true, deletionStatus: true, currency: true },
    });
    if (!lista) throw new NotFoundException('Lista no encontrada.');
    await this.acl.assertListaAccess(listaId, ctx, 'view_prices');
    return lista;
  }

  /**
   * Referencias (SKU + precios vigentes por tarifa) de ESA lista. P1 estricto:
   * los precios se incluyen SOLO con la concesión `prices:read` vigente; sin
   * ella se exportan/plantillan los SKUs sin valores.
   */
  private async collectListaReferences(
    listaId: string,
    tariffs: PriceImportTariff[],
    ctx: AccessContext,
  ): Promise<TemplateReferenceInput[]> {
    const products = await this.prisma.product.findMany({
      where: { listaId },
      select: { id: true, sku: true },
      orderBy: { sku: 'asc' },
      take: MAX_PRICE_IMPORT_ROWS,
    });
    const references = products.map((p) => ({ sku: p.sku }));
    const withPrices = (await this.grants?.grantsForUser(ctx.userId)) ?? [];
    const identity: AccessIdentity = {
      userId: ctx.userId,
      verified: true,
      active: true,
      sessionValid: true,
      sessionUserId: ctx.userId,
      superAdmin: ctx.roles.includes('Super Admin'),
    };
    const maySeePrices = withPrices.length > 0 &&
      resolveAccess({ identity, actionId: 'prices:read', grants: withPrices }).allowed;
    if (!maySeePrices || products.length === 0) return references;
    const priceLists = await this.prisma.priceList.findMany({
      where: { code: { in: tariffs }, isActive: true, currency: 'COP' },
      select: { id: true, code: true },
    });
    const stored = priceLists.length ? await this.prisma.price.findMany({
      where: { productId: { in: products.map((p) => p.id) }, priceListId: { in: priceLists.map((l) => l.id) } },
      select: { productId: true, priceListId: true, value: true },
    }) : [];
    const byCode = new Map(priceLists.map((l) => [l.id, l.code]));
    const byProduct = new Map<string, Partial<Record<PriceImportTariff, string>>>();
    for (const row of stored) {
      const code = byCode.get(row.priceListId);
      if (!code) continue;
      const entry = byProduct.get(row.productId) ?? {};
      entry[code as PriceImportTariff] = row.value.toString();
      byProduct.set(row.productId, entry);
    }
    return products.map((p) => ({ sku: p.sku, prices: byProduct.get(p.id) }));
  }

  // ─── IMP-07B (07B) — perfiles de proveedor reutilizables ───

  private assertProviderRead(ctx: AccessContext): Promise<void> {
    return this.assertActions(ctx, ['providers:read'], 'No tienes asignada la consulta de perfiles de proveedor.');
  }

  private assertProviderWrite(ctx: AccessContext): Promise<void> {
    return this.assertActions(ctx, ['providers:write', 'providers:read'], 'No tienes asignada la edición de perfiles de proveedor.');
  }

  private toProfileView(profile: ProviderProfileRow): ProviderProfileView {
    return {
      id: profile.id,
      providerName: profile.providerName,
      sheet: profile.sheet,
      headerRow: profile.headerRow,
      thousandsSeparator: profile.thousandsSeparator,
      decimalSeparator: profile.decimalSeparator,
      currency: profile.currency,
      tariffs: Array.isArray(profile.tariffs) ? (profile.tariffs as string[]) : [],
      expectedColumns: Array.isArray(profile.expectedColumns) ? (profile.expectedColumns as string[]) : [],
      version: profile.version,
      createdAt: profile.createdAt.toISOString(),
      updatedAt: profile.updatedAt.toISOString(),
      equivalences: (profile.equivalences ?? []).map((e) => ({ externalRef: e.externalRef, productId: e.productId })),
    };
  }

  private validateProfileInput(input: ProviderProfileInput): NormalizedProviderProfile {
    const validation = validateProviderProfile(input);
    if (validation.errors.length > 0) throw new BadRequestException(validation.errors.join(' '));
    return validation.value as NormalizedProviderProfile;
  }

  async listProviderProfiles(ctx: AccessContext): Promise<ProviderProfileView[]> {
    await this.assertProviderRead(ctx);
    const rows = await this.prisma.providerProfile.findMany({ include: { equivalences: true }, orderBy: { providerName: 'asc' } });
    return rows.map((r) => this.toProfileView(r));
  }

  async getProviderProfile(id: string, ctx: AccessContext): Promise<ProviderProfileView> {
    await this.assertProviderRead(ctx);
    const profile = await this.prisma.providerProfile.findUnique({ where: { id }, include: { equivalences: true } });
    if (!profile) throw new NotFoundException('Perfil de proveedor no encontrado.');
    return this.toProfileView(profile);
  }

  async createProviderProfile(input: ProviderProfileInput, ctx: AccessContext): Promise<ProviderProfileView> {
    await this.assertProviderWrite(ctx);
    const value = this.validateProfileInput(input);
    const existing = await this.prisma.providerProfile.findUnique({ where: { providerName: value.providerName } });
    if (existing) throw new ConflictException('Ya existe un perfil para ese proveedor; edítalo en lugar de crear otro.');
    const profile = await this.prisma.providerProfile.create({
      data: { ...value, createdById: ctx.userId, updatedById: ctx.userId },
      include: { equivalences: true },
    });
    await this.audit.log({ userId: ctx.userId, action: 'provider-profile-create', entity: 'PROVIDER_PROFILE', entityId: profile.id, newValues: { providerName: profile.providerName, version: profile.version }, result: 'SUCCESS' });
    return this.toProfileView(profile);
  }

  async updateProviderProfile(id: string, input: ProviderProfileInput, ctx: AccessContext): Promise<ProviderProfileView> {
    await this.assertProviderWrite(ctx);
    const value = this.validateProfileInput(input);
    const current = await this.prisma.providerProfile.findUnique({ where: { id }, include: { equivalences: true } });
    if (!current) throw new NotFoundException('Perfil de proveedor no encontrado.');
    const currentNormalized: NormalizedProviderProfile = {
      providerName: current.providerName,
      sheet: current.sheet,
      headerRow: current.headerRow,
      thousandsSeparator: current.thousandsSeparator as '' | '.' | ',',
      decimalSeparator: current.decimalSeparator as '.' | ',',
      currency: 'COP',
      tariffs: (current.tariffs as PriceImportTariff[]),
      expectedColumns: (current.expectedColumns as string[]),
    };
    const structureChanged = profileStructureChanged(currentNormalized, value);
    if (value.providerName !== current.providerName) {
      const clash = await this.prisma.providerProfile.findUnique({ where: { providerName: value.providerName } });
      if (clash) throw new ConflictException('Ya existe un perfil para ese proveedor.');
    }
    const profile = await this.prisma.providerProfile.update({
      where: { id },
      data: { ...value, version: structureChanged ? current.version + 1 : current.version, updatedById: ctx.userId },
      include: { equivalences: true },
    });
    await this.audit.log({ userId: ctx.userId, action: 'provider-profile-update', entity: 'PROVIDER_PROFILE', entityId: id, newValues: { providerName: profile.providerName, version: profile.version, structureChanged }, result: 'SUCCESS' });
    return this.toProfileView(profile);
  }

  async deleteProviderProfile(id: string, ctx: AccessContext): Promise<{ id: string; deleted: true }> {
    await this.assertProviderWrite(ctx);
    const current = await this.prisma.providerProfile.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Perfil de proveedor no encontrado.');
    await this.prisma.providerProfile.delete({ where: { id } });
    await this.audit.log({ userId: ctx.userId, action: 'provider-profile-delete', entity: 'PROVIDER_PROFILE', entityId: id, newValues: { providerName: current.providerName }, result: 'SUCCESS' });
    return { id, deleted: true };
  }

  private normalizeEquivalences(equivalences: EquivalenceInput[]): EquivalenceInput[] {
    if (!Array.isArray(equivalences)) throw new BadRequestException('Las equivalencias deben ser una lista.');
    const seen = new Set<string>();
    const out: EquivalenceInput[] = [];
    for (const eq of equivalences) {
      const externalRef = typeof eq?.externalRef === 'string' ? eq.externalRef.trim() : '';
      const productId = typeof eq?.productId === 'string' ? eq.productId.trim() : '';
      if (!externalRef) throw new BadRequestException('Cada equivalencia necesita una referencia externa.');
      if (externalRef.length > 200) throw new BadRequestException('Una referencia externa supera 200 caracteres.');
      if (!UUID_RE.test(productId)) throw new BadRequestException(`Producto inválido en la equivalencia "${externalRef}".`);
      if (seen.has(externalRef)) throw new BadRequestException(`Referencia externa repetida: ${externalRef}.`);
      seen.add(externalRef);
      out.push({ externalRef, productId });
    }
    return out;
  }

  async setProviderEquivalences(id: string, equivalences: EquivalenceInput[], ctx: AccessContext): Promise<ProviderProfileView> {
    await this.assertProviderWrite(ctx);
    const profile = await this.prisma.providerProfile.findUnique({ where: { id } });
    if (!profile) throw new NotFoundException('Perfil de proveedor no encontrado.');
    const cleaned = this.normalizeEquivalences(equivalences);
    const productIds = [...new Set(cleaned.map((e) => e.productId))];
    const found = productIds.length
      ? await this.prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true } })
      : [];
    const foundIds = new Set(found.map((p) => p.id));
    const missing = productIds.filter((pid) => !foundIds.has(pid));
    if (missing.length > 0) throw new BadRequestException(`Producto no encontrado: ${missing.join(', ')}.`);
    await this.prisma.$transaction([
      this.prisma.providerEquivalence.deleteMany({ where: { providerProfileId: id } }),
      ...cleaned.map((e) =>
        this.prisma.providerEquivalence.create({ data: { providerProfileId: id, externalRef: e.externalRef, productId: e.productId } }),
      ),
    ]);
    await this.audit.log({ userId: ctx.userId, action: 'provider-profile-equivalences', entity: 'PROVIDER_PROFILE', entityId: id, newValues: { count: cleaned.length }, result: 'SUCCESS' });
    const updated = await this.prisma.providerProfile.findUnique({ where: { id }, include: { equivalences: true } });
    return this.toProfileView(updated as ProviderProfileRow);
  }

  /**
   * Reconoce el perfil de un proveedor por su nombre y compara la huella de
   * encabezados. `requiresReview` = true si no existe o si el encabezado
   * cambió (no se carga en una tarifa parecida; contrato §4, casos 1 y 2).
   */
  async recognizeProviderProfile(input: { providerName: string; headers: string[] }, ctx: AccessContext): Promise<RecognitionView> {
    await this.assertProviderRead(ctx);
    const providerName = typeof input?.providerName === 'string' ? input.providerName.trim() : '';
    if (!providerName) throw new BadRequestException('Indica el proveedor.');
    const headers = Array.isArray(input?.headers) ? input.headers.filter((h) => typeof h === 'string') : [];
    const profile = await this.prisma.providerProfile.findUnique({ where: { providerName } });
    if (!profile) {
      return { found: false, profileId: null, providerName, version: null, matches: false, requiresReview: true, expectedColumns: [] };
    }
    const expectedColumns = Array.isArray(profile.expectedColumns) ? (profile.expectedColumns as string[]) : [];
    const matches = profileMatchesHeaders({ expectedColumns }, headers);
    return { found: true, profileId: profile.id, providerName, version: profile.version, matches, requiresReview: !matches, expectedColumns };
  }

  /** Resuelve referencias externas contra las equivalencias del perfil (sin equivalencia → pendiente). */
  async resolveProviderReferences(id: string, references: string[], ctx: AccessContext): Promise<{ profileId: string; resolution: ResolvedReference[] }> {
    await this.assertProviderRead(ctx);
    const profile = await this.prisma.providerProfile.findUnique({ where: { id }, include: { equivalences: true } });
    if (!profile) throw new NotFoundException('Perfil de proveedor no encontrado.');
    const refs = Array.isArray(references) ? references.filter((r) => typeof r === 'string') : [];
    const equivalences = profile.equivalences.map((e) => ({ externalRef: e.externalRef, productId: e.productId }));
    return { profileId: id, resolution: resolveExternalReferences(equivalences, refs) };
  }
}
