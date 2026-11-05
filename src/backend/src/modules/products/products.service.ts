import {
  Inject,
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Optional,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BibliotecaPrismaService } from '../../prisma/biblioteca-prisma.service';
import type { Prisma as LibraryPrisma } from '../../../prisma/biblioteca/generated/client';
import { LibraryAuditService } from '../library-audit/library-audit.service';
import { directLegacyProductLibrary } from './product-library';
import { PrismaService } from '../../prisma/prisma.service';
import { AclService, AccessContext } from '../../common/acl/acl.service';
import { ProductRevisionsService } from './product-revisions.service';
import { AuditService } from '../audit/audit.service';
import { diffFields, ProductChangeService, type ProductChangeSource } from './product-change.service';
import { FilesService } from '../files/files.service';
import { detectKind, declaredMatchesDetected, sha256Hex } from '../files/file-signature';
import { AccessAssignmentsService } from '../../common/security/access-assignments.service';
import { assertGlobalGrant, hasGlobalGrant } from '../../common/security/require-grant';
import { redactInternalNotes } from '../../common/security/internal-notes';
import { ProductValidationService } from './validation/validation.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { PublishProductDto } from './dto/publish-product.dto';
import { UnpublishProductDto } from './dto/unpublish-product.dto';
import { TransitionProductDto } from './dto/transition.dto';
import { DeleteProductDto } from './dto/delete-product.dto';
import { SchedulePublicationDto } from './dto/schedule-publication.dto';
import { BulkSchedulePublicationDto } from './dto/bulk-schedule-publication.dto';
import { SpecFieldDto, SpecsDto, SpecType } from './dto/spec-field.dto';
import {
  LifecycleStatus,
  LifecycleEvent,
  LIFECYCLE_STATUSES,
  TRANSITION_RULES,
  EVENT_AUDIT_ACTION,
} from './lifecycle.types';
import { Prisma, Product, type ProductImageType } from '@prisma/client';
import * as XLSX from 'xlsx';
import { normalizeText } from './import/helpers/text-normalizer';
import { findProductBySku, normalizeSku } from './helpers/sku-identity';
import { pickPrimaryImageByProduct, primaryImageInclude } from './helpers/primary-image';
import { priceValidityWhere } from './validation/price-validity';
import { isWebBrandExcluded } from './web-brand-policy';
import { ClassificationService } from './classification/classification.service';
import type { ClassificationDb } from './classification/classification.types';

const ALLOWED_IMAGE_MIMETYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};
const MAX_IMAGE_SIZE = 8 * 1024 * 1024; // 8 MB
const MAX_DOCUMENT_SIZE = 16 * 1024 * 1024; // 16 MB (CAT-04 documentos)

/** Reporte de un tick del scheduler P6 (cron cada minuto). */
export interface SchedulerTickReport {
  runAt: Date;
  /** true si el tick se descartó porque el anterior aún corría (lock en memoria). */
  skipped: boolean;
  publishOk: number;
  publishFailed: Array<{ id: string; reasons: string }>;
}

/** Resultado consolidado de una operacion de publicacion/programacion/cancelacion por Lista. */
export interface ListaPublicationBatchResult {
  listaId: string;
  processed: number;
  succeeded: number;
  skipped: number;
  failed: number;
  results: Array<{
    productId: string;
    sku?: string;
    status: 'SUCCESS' | 'SKIPPED' | 'ERROR';
    code?: string;
    message: string;
  }>;
}

/** Scalar/delegate compatibility for the unchanged T03 Product contract. Operational
 * delegates are deliberately absent; all cross-domain reads use operational explicitly. */
type ProductCatalogClient = Pick<PrismaService, 'product' | 'category' | 'brand' | 'price' | 'priceList' | 'productImage' | 'productRevision' | 'lista' | 'publicationEvent' | '$transaction' | '$queryRaw' | '$queryRawUnsafe'>;

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);
  private similarityUnavailable = false;

  constructor(
    private readonly operational: PrismaService,
    private acl: AclService,
    private audit: AuditService,
    private files: FilesService,
    /**
     * CAT-02 alternativas: enruta ediciones legacy a REVISION_PENDIENTE.
     * Opcional para conservar construcciones de 4 argumentos en specs previos;
     * Nest lo inyecta (ProductsModule lo provee).
     */
    @Optional() private readonly revisions?: ProductRevisionsService,
    /**
     * CAT-04 §4: la subida/borrado de activos exige `products:write` cuando el
     * usuario tiene concesiones (transición D5; sin grants manda @Roles+ACL).
     * Opcional por el mismo motivo que `revisions` (SecurityModule @Global).
     */
    @Optional() private readonly grants?: AccessAssignmentsService,
    /**
     * CAT-06 (P2): antes de publicar/programar se re-ejecuta el motor de
     * validacion CAT-05 (nunca se confía en un informe guardado). Opcional por
     * el mismo motivo que `grants` (los specs previos siguen construyendo sin
     * el; Nest lo inyecta via ProductsModule).
     */
    @Optional() private readonly validation?: ProductValidationService,
    /** Per-product history writer (Nest injects the shared one; specs may omit it). */
    @Optional() changes?: ProductChangeService,
    @Optional() @Inject(BibliotecaPrismaService) private readonly library: BibliotecaPrismaService = directLegacyProductLibrary(operational),
    @Optional() @Inject(LibraryAuditService) private readonly libraryAudit: LibraryAuditService = new LibraryAuditService(library),
    @Optional() private readonly classification: ClassificationService = new ClassificationService(),
  ) {
    this.changes = changes ?? new ProductChangeService(operational, acl, grants, library);
  }

  private readonly changes: ProductChangeService;

  private isMissingSimilarityFunction(error: unknown): boolean {
    const databaseError = error as {
      code?: unknown;
      meta?: { code?: unknown; message?: unknown };
      message?: unknown;
    } | null;
    return databaseError?.code === 'P2010'
      && String(databaseError.meta?.code) === '42883'
      && /function\s+similarity\s*\(\s*text\s*,\s*text\s*\)\s+does not exist/i.test(
        String(databaseError.meta?.message ?? databaseError.message ?? ''),
      );
  }

  private get prisma(): ProductCatalogClient { return this.library.client as unknown as ProductCatalogClient; }

  private writeTransaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.library.writeTransaction((tx) => work(tx as unknown as Prisma.TransactionClient));
  }

  private async appendLibraryEvent(tx: Prisma.TransactionClient, action: string, entityType: string, entityId: string, summary: LibraryPrisma.InputJsonObject, ctx?: AccessContext) {
    if (this.library.config.mode === 'legacy') return;
    return this.libraryAudit.append(tx as unknown as LibraryPrisma.TransactionClient, { actor: { id: ctx?.userId, name: ctx?.userName ?? null }, action, entityType, entityId, summary });
  }

  /** Auditoría histórica (AuditLog operativo): solo en legacy. En modo dedicado el evento va dentro de la transacción de biblioteca. */
  private async legacyAudit(entry: Parameters<AuditService['log']>[0]): Promise<void> {
    if (this.library.config.mode === 'legacy') await this.audit.log(entry);
  }

  /**
   * Resumen de una operación por lotes (productos o Lista completa). Cada producto ya quedó
   * escrito con su propio evento; esto deja el resumen agregado: AuditLog en legacy, evento de biblioteca en dedicado.
   */
  private async batchAudit(entry: Parameters<AuditService['log']>[0], ctx: AccessContext, ids?: string[]): Promise<void> {
    if (this.library.config.mode === 'legacy') {
      await this.audit.log(entry);
      return;
    }
    const summary = { ...((entry.newValues ?? {}) as Record<string, unknown>), result: entry.result ?? null, ...(ids ? { total: ids.length, ids: ids.slice(0, 200) } : {}) } as LibraryPrisma.InputJsonObject;
    const entityId = ids ? 'batch' : String(entry.entityId ?? 'batch');
    await this.writeTransaction((tx) => this.appendLibraryEvent(tx, `BATCH_${String(entry.action).toUpperCase()}`, String(entry.entity ?? 'Product'), entityId, summary, ctx));
  }

  /** `subcategory` relation for reads; empty when the library client has no Subcategory model. */
  private subcategoryInclude(): { subcategory?: { select: { id: true; name: true; slug: true } } } {
    return (this.prisma as unknown as { subcategory?: unknown }).subcategory
      ? { subcategory: { select: { id: true, name: true, slug: true } } }
      : {};
  }

  /** Read model: exposes `subcategory` and the draft state "por clasificar" (C2) next to the product. */
  private withClassificationStatus<T extends { subcategoryId?: string | null; brandId?: string | null }>(product: T) {
    const subcategory = (product as { subcategory?: { id: string; name: string; slug: string } | null }).subcategory ?? null;
    const missing: Array<'brand' | 'subcategory'> = [
      ...(product.brandId ? [] : ['brand' as const]),
      ...(product.subcategoryId ? [] : ['subcategory' as const]),
    ];
    return { ...product, subcategory, classificationStatus: (missing.length ? 'incomplete' : 'complete') as 'complete' | 'incomplete', classificationMissing: missing };
  }

  private assertOwnedTransaction(tx: Prisma.TransactionClient): void {
    this.library.assertWritesAllowed();
    if (this.library.config.mode === 'dedicated' && !this.library.ownsTransaction(tx)) throw new ServiceUnavailableException({ code: 'LIBRARY_FOREIGN_TRANSACTION', message: 'Se requiere una transacción activa de biblioteca.' });
  }

  /** Identity/commercial fields of `create` and `update` recorded in the per-product history. */
  private static readonly EDIT_HISTORY_FIELDS = ['sku', 'name', 'description', 'categoryId', 'brandId', 'listaId'] as const;
  /** Lifecycle/visibility mirror columns recorded for every state change (FSM, scheduling). */
  private static readonly STATE_HISTORY_FIELDS = ['lifecycleStatus', 'publishStatus', 'isActive', 'isVisible', 'publishAt'] as const;

  /**
   * Writes the per-product history rows for a mutation through the SAME transaction
   * client. A field is recorded only when its value really changed, so a save that
   * changes nothing writes nothing. `before` is null for a creation.
   */
  private async recordProductChanges(
    tx: Prisma.TransactionClient,
    before: Record<string, unknown> | null,
    after: { id: string; sku: string } & Record<string, unknown>,
    fields: readonly string[],
    source: ProductChangeSource,
    ctx?: AccessContext,
  ): Promise<void> {
    const rows = diffFields(before, after, fields, {
      productId: after.id, sku: after.sku, source, sourceRef: after.id, actorId: ctx?.userId ?? null,
    });
    await this.changes.record(tx, rows);
  }

  /** Updates lifecycle/visibility columns and records the state change (source LIFECYCLE) in one transaction. */
  private updateWithStateHistory(
    id: string,
    before: Product,
    data: Prisma.ProductUncheckedUpdateInput,
    ctx?: AccessContext,
    event?: { action: string; summary: LibraryPrisma.InputJsonObject },
  ): Promise<Product> {
    return this.writeTransaction(async (tx) => {
      const row = await tx.product.update({ where: { id }, data });
      await this.recordProductChanges(tx, before, row as never, ProductsService.STATE_HISTORY_FIELDS, 'LIFECYCLE', ctx);
      if (event) await this.appendLibraryEvent(tx, event.action, 'Product', id, event.summary, ctx);
      return row;
    });
  }

  /**
   * Lock en memoria del tick del scheduler (P6): impide que dos ticks del cron
   * se solapen en el mismo proceso. Los ticks están espaciados 1 minuto, pero
   * si una ejecución se alarga más de 60s este booleano descarta el siguiente.
   */
  private lifecycleTickRunning = false;

  private trendingCache: Map<string, { data: any; meta: { total: number; take?: number }; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutos de expiración de caché

  /**
   * Cachea productos tendencia por 5 minutos
   */
  private getFromTrendingCache(key?: string): { data: any; meta: { total: number; take?: number } } | null {
    const cacheKey = key || 'default';
    const cached = this.trendingCache.get(cacheKey);
    if (!cached) return null;
    if (Date.now() - cached.timestamp > this.CACHE_TTL) {
      this.trendingCache.delete(cacheKey);
      return null;
    }
    return { data: cached.data, meta: cached.meta };
  }

  private setTrendingCache(key: string, data: { data: any; meta: { total: number; take?: number } }): void {
    this.trendingCache.set(key, {
      ...data,
      timestamp: Date.now(),
    });
  }

  /**
   * Convierte un objeto legacy (Record<string, any>) al nuevo formato SpecFieldDto[].
   * Cada key-value se convierte en un SpecFieldDto con type TEXT por defecto.
   */
  private migrateLegacySpecs(legacy: Record<string, any> | undefined): SpecFieldDto[] | undefined {
    if (!legacy || typeof legacy !== 'object') return undefined;
    return Object.entries(legacy).map(([key, value]) => ({
      key,
      type: SpecType.TEXT,
      value: typeof value === 'object' ? JSON.stringify(value) : String(value),
    }));
  }

  /**
   * Valida un array de SpecFieldDto según las reglas de tipo:
   * - TEXT: value debe ser string
   * - NUMBER: value debe ser number
   * - BOOLEAN: value debe ser boolean
   * - SELECT: value debe ser string y estar en options (si options existe)
   * - UNIT: value debe ser string, unit es obligatorio
   * - required: si true, value no puede ser null/undefined/empty string
   */
  private validateSpecs(specs: SpecFieldDto[] | undefined, fieldName: string): void {
    if (!specs || !specs.length) return;

    for (const spec of specs) {
      // Validar required
      if (spec.required && (spec.value === undefined || spec.value === null || spec.value === '')) {
        throw new BadRequestException(`El campo "${spec.key}" en ${fieldName} es obligatorio`);
      }

      // Validar según type
      switch (spec.type) {
        case SpecType.TEXT:
          if (spec.value !== undefined && spec.value !== null && typeof spec.value !== 'string') {
            throw new BadRequestException(`El campo "${spec.key}" en ${fieldName} debe ser de tipo TEXT (string)`);
          }
          break;
        case SpecType.NUMBER:
          if (spec.value !== undefined && spec.value !== null && typeof spec.value !== 'number') {
            throw new BadRequestException(`El campo "${spec.key}" en ${fieldName} debe ser de tipo NUMBER (number)`);
          }
          break;
        case SpecType.BOOLEAN:
          if (spec.value !== undefined && spec.value !== null && typeof spec.value !== 'boolean') {
            throw new BadRequestException(`El campo "${spec.key}" en ${fieldName} debe ser de tipo BOOLEAN (boolean)`);
          }
          break;
        case SpecType.SELECT:
          if (spec.value !== undefined && spec.value !== null) {
            if (typeof spec.value !== 'string') {
              throw new BadRequestException(`El campo "${spec.key}" en ${fieldName} debe ser de tipo SELECT (string)`);
            }
            if (spec.options && spec.options.length > 0 && !spec.options.includes(spec.value)) {
              throw new BadRequestException(`El valor "${spec.value}" para "${spec.key}" en ${fieldName} no está en las opciones permitidas: ${spec.options.join(', ')}`);
            }
          }
          break;
        case SpecType.UNIT:
          if (!spec.unit) {
            throw new BadRequestException(`El campo "${spec.key}" en ${fieldName} de tipo UNIT requiere la propiedad "unit"`);
          }
          if (spec.value !== undefined && spec.value !== null && typeof spec.value !== 'string') {
            throw new BadRequestException(`El campo "${spec.key}" en ${fieldName} debe ser de tipo UNIT (string con unidad)`);
          }
          break;
      }
    }
  }

  /**
   * Prepara specs para guardado en BD: convierte SpecFieldDto[] a JSON serializable
   * manteniendo la estructura tipada.
   */
  private prepareSpecsForStorage(specs: SpecFieldDto[] | undefined): any {
    if (!specs || !specs.length) return undefined;
    return specs.map(s => ({
      key: s.key,
      type: s.type,
      unit: s.unit,
      options: s.options,
      required: s.required,
      value: s.value,
    }));
  }

  /**
   * Combina specs nuevos (tipados) con legacy (planos) dando prioridad a los nuevos.
   * Si vienen specs nuevos, se usan esos; si no, se migran los legacy.
   */
  private resolveSpecs(
    newSpecs: SpecsDto | undefined,
    legacySpecs: Record<string, any> | undefined,
  ): SpecFieldDto[] | undefined {
    if (newSpecs && newSpecs.specs && newSpecs.specs.length > 0) {
      return newSpecs.specs;
    }
    return this.migrateLegacySpecs(legacySpecs);
  }

  /**
   * Estado calculado de stock para un conjunto de productos (checklist 42):
   * 'in_stock' (availableQty > 0), 'out_of_stock' (availableQty 0), 'no_stock_data'
   * (sin registro de stock). No oculta productos automáticamente: la regla de
   * negocio para ocultar por falta de stock queda pendiente de decisión.
   */
  private async getStockStatusMap(
    productIds: string[],
  ): Promise<Map<string, 'in_stock' | 'out_of_stock' | 'no_stock_data'>> {
    if (!productIds.length) return new Map();
    const stocks = (await this.operational.stock.findMany({
      where: { productId: { in: productIds } },
    })) ?? [];
    const map = new Map<string, 'in_stock' | 'out_of_stock' | 'no_stock_data'>();
    for (const s of stocks) {
      map.set(s.productId, s.availableQty > 0 ? 'in_stock' : 'out_of_stock');
    }
    return map;
  }

  /**
   * Obtiene productos tendencia (últimos 30 días visibles y activos)
   */
  async findTrending(params?: {
    take?: number;
    categoryId?: string;
    search?: string;
    forceReload?: boolean;
  }, ctx?: AccessContext): Promise<{
    data: any;
    meta: { total: number; take?: number }
  }> {
    const cacheKey = `${params?.take || 5}-${params?.categoryId || ''}-${params?.search || ''}`;
    
    if (params?.forceReload || !this.getFromTrendingCache(cacheKey)) {
      const take = params?.take || 5;

      if (params?.search && params.search.trim().length > 2) {
        // Fuzzy search para trending
        const searchTerm = params.search.trim();
        const categoryId = params?.categoryId;

        // categoryId is caller-controlled: bind it as a query parameter, never interpolate it into the SQL string.
        const baseWhere = `WHERE "isVisible" = true AND "isActive" = true AND "createdAt" >= NOW() - INTERVAL '30 days'`;
        const countWhere = categoryId ? `${baseWhere} AND "categoryId" = $2` : baseWhere;
        const selectWhere = categoryId ? `${baseWhere} AND "categoryId" = $3` : baseWhere;

        const countResult = await this.prisma.$queryRawUnsafe<{ count: bigint }[]>(`
          SELECT COUNT(*)::bigint as count
          FROM "products"
          ${countWhere}
          AND (similarity("name", $1) + similarity("sku", $1) + similarity(COALESCE("description", ''), $1)) > 0.1
        `, searchTerm, ...(categoryId ? [categoryId] : []));
        const total = Number(countResult[0]?.count ?? 0);

        const products = await this.prisma.$queryRawUnsafe<any[]>(`
          SELECT
            p.*,
            (similarity(p."name", $1) + similarity(p."sku", $1) + similarity(COALESCE(p."description", ''), $1)) as _similarity
          FROM "products" p
          ${selectWhere}
          AND (similarity(p."name", $1) + similarity(p."sku", $1) + similarity(COALESCE(p."description", ''), $1)) > 0.1
          ORDER BY _similarity DESC
          LIMIT $2
        `, searchTerm, take, ...(categoryId ? [categoryId] : []));

        // Fetch related data
        const productIds = products.map(p => p.id);
        const [categories, brands, images, prices] = await Promise.all([
          productIds.length > 0 ? this.prisma.category.findMany({
            where: { id: { in: [...new Set(products.map(p => p.categoryId).filter((id): id is string => !!id))] } },
            select: { id: true, name: true, slug: true }
          }) : [],
          productIds.length > 0 ? this.prisma.brand.findMany({
            where: { id: { in: [...new Set(products.map(p => p.brandId).filter((id): id is string => !!id))] } },
            select: { id: true, name: true, slug: true }
          }) : [],
          productIds.length > 0 ? this.prisma.productImage.findMany({
            where: { productId: { in: productIds } },
            select: { productId: true, url: true, alt: true, type: true, isPrimary: true, sortOrder: true }
          }) : [],
          productIds.length > 0 ? this.prisma.price.findMany({
            where: { productId: { in: productIds } },
            include: { priceList: { select: { id: true, name: true, code: true } } }
          }) : [],
        ]);

        const categoryMap = new Map<string, typeof categories[0]>(categories.map(c => [c.id, c] as const));
        const brandMap = new Map<string, typeof brands[0]>(brands.map(b => [b.id, b] as const));
        const imageMap = pickPrimaryImageByProduct(images);
        const pricesByProduct = new Map<string, typeof prices>();
        for (const price of prices) {
          const arr = pricesByProduct.get(price.productId) || [];
          arr.push(price);
          pricesByProduct.set(price.productId, arr);
        }

        const formattedProducts = products.map(p => ({
          ...p,
          category: categoryMap.get(p.categoryId) || null,
          brand: brandMap.get(p.brandId) || null,
          images: imageMap.get(p.id) ? [imageMap.get(p.id)!] : [],
          prices: pricesByProduct.get(p.productId) || [],
          _similarity: undefined,
        }));

        this.setTrendingCache(cacheKey, {
          data: formattedProducts,
          meta: { total, take },
        });
      } else {
        // Fallback: búsqueda por contains insensible
        const where: Prisma.ProductWhereInput = {
          isVisible: true,
          isActive: true,
          createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
          ...(params?.categoryId && { categoryId: params.categoryId }),
          ...(params?.search && {
            OR: [
              { name: { contains: params.search, mode: 'insensitive' } },
              { sku: { contains: params.search, mode: 'insensitive' } },
              { description: { contains: params.search, mode: 'insensitive' } },
            ],
          }),
        };

        const [products, total] = await Promise.all([
          this.prisma.product.findMany({
            where,
            take,
            orderBy: { createdAt: 'desc' },
            include: {
              category: { select: { id: true, name: true, slug: true } },
              brand: { select: { id: true, name: true, slug: true } },
              images: primaryImageInclude(),
              prices: { include: { priceList: { select: { id: true, name: true, code: true } } } },
            },
          }),
          this.prisma.product.count({ where }),
        ]);

        this.setTrendingCache(cacheKey, {
          data: products,
          meta: { total, take },
        });
      }
    }

    const cached = this.getFromTrendingCache(cacheKey);
    // La cache es compartida entre usuarios: las notas internas se quitan por llamada, nunca en la cache.
    return {
      data: await redactInternalNotes(this.grants, ctx, cached?.data || []),
      meta: cached?.meta || { total: 0, take: params?.take || 5 },
    };
  }

  async findAll(
    params?: {
      skip?: number;
      take?: number;
      search?: string;
      categoryId?: string;
      categoryIds?: string[];
      brandId?: string;
      isVisible?: boolean;
      isActive?: boolean;
      activeListaOnly?: boolean;
    },
    ctx?: AccessContext,
  ) {
    const { skip = 0, take = 50, search, categoryId, categoryIds, brandId, isVisible, isActive, activeListaOnly } = params || {};

    // Biblioteca autoriza SOLO por la concesion global `products:read` (nunca por cargo ni por Listas):
    // con ella se ven todos los productos; sin ella 403 (no una lista vacia).
    // ctx opcional: los llamadores internos/tests sin ctx conservan el comportamiento abierto.
    if (ctx) await assertGlobalGrant(this.grants, 'products:read', ctx);

    const selectedCategoryIds = [...new Set((categoryIds ?? []).filter(Boolean))];
    const categoryChildren = selectedCategoryIds.length
      ? (await this.prisma.category.findMany({
          where: { parentId: { in: selectedCategoryIds } },
          select: { id: true },
        }) ?? [])
      : [];
    // Keep the legacy singular filter exact; the new multi-select filter expands
    // each selected node by one level, matching the approved two-level tree.
    const categoryFilterIds = [...new Set([
      ...(categoryId ? [categoryId] : []),
      ...selectedCategoryIds,
      ...categoryChildren.map((category) => category.id),
    ])];

    let products: any[];
    let total: number;

    if (search?.trim()) {
      // La búsqueda literal cubre cualquier término; pg_trgm solo añade orden/relevancia.
      const searchTerm = search.trim();
      // Todo valor externo viaja como parámetro ($n); en el SQL solo hay texto fijo.
      // $1 es el término de búsqueda; los filtros ocupan $2..$n.
      const filterParams: unknown[] = [];
      const bind = (value: unknown) => {
        filterParams.push(value);
        return `$${filterParams.length + 1}`;
      };
      const categoryFilter = selectedCategoryIds.length
        ? `AND p."categoryId" IN (${categoryFilterIds.map((id) => bind(id)).join(', ')})`
        : categoryId ? `AND p."categoryId" = ${bind(categoryId)}` : '';
      const brandFilter = brandId ? `AND p."brandId" = ${bind(brandId)}` : '';
      const isVisibleFilter = isVisible !== undefined ? `AND p."isVisible" = ${bind(isVisible)}::boolean` : '';
      const isActiveFilter = isActive !== undefined ? `AND p."isActive" = ${bind(isActive)}::boolean` : '';
      const activeListaOnlyFilter = activeListaOnly
        ? `AND EXISTS (SELECT 1 FROM "listas" l WHERE l.id = p."listaId" AND l."isActive" = true AND l."archivedAt" IS NULL)`
        : '';

      const whereClause = `WHERE 1=1 ${categoryFilter} ${brandFilter} ${isVisibleFilter} ${isActiveFilter} ${activeListaOnlyFilter}`;
      const normalizedSearch = `NULLIF(regexp_replace(upper($1), '[^A-Z0-9]', '', 'g'), '')`;
      const normalizedSku = `regexp_replace(upper(COALESCE(p."sku", '')), '[^A-Z0-9]', '', 'g')`;
      const literalMatch = `(
        POSITION(LOWER($1) IN LOWER(COALESCE(p."name", ''))) > 0
        OR POSITION(LOWER($1) IN LOWER(COALESCE(p."catalogName", ''))) > 0
        OR POSITION(LOWER($1) IN LOWER(COALESCE(p."sku", ''))) > 0
        OR POSITION(LOWER($1) IN LOWER(COALESCE(p."description", ''))) > 0
        OR (${normalizedSearch} IS NOT NULL AND POSITION(${normalizedSearch} IN ${normalizedSku}) > 0)
      )`;
      const limitParam = `$${filterParams.length + 2}`;
      const offsetParam = `$${filterParams.length + 3}`;
      const runSearch = async (useSimilarity: boolean) => {
        const fuzzyMatch = useSimilarity
          ? `(similarity(COALESCE(p."name", ''), $1) + similarity(COALESCE(p."catalogName", ''), $1) + similarity(COALESCE(p."sku", ''), $1) + similarity(COALESCE(p."description", ''), $1)) > 0.1`
          : 'false';
        const similarityScore = useSimilarity
          ? `(similarity(COALESCE(p."name", ''), $1) + similarity(COALESCE(p."catalogName", ''), $1) + similarity(COALESCE(p."sku", ''), $1) + similarity(COALESCE(p."description", ''), $1))`
          : '0::real';
        const searchClause = `AND (${literalMatch} OR ${fuzzyMatch})`;

        // Conteo y resultados comparten el mismo predicado literal/fuzzy.
        const countResult = await this.prisma.$queryRawUnsafe<{ count: bigint }[]>(`
          SELECT COUNT(*)::bigint as count
          FROM "products" p
          ${whereClause}
          ${searchClause}
        `, searchTerm, ...filterParams);
        const matchingCount = Number(countResult[0]?.count ?? 0);

        // Paginar con relevancia trigram si está disponible; substring siempre se incluye.
        const foundProducts = await this.prisma.$queryRawUnsafe<any[]>(`
          SELECT
            p.*,
            ${similarityScore} as _similarity
          FROM "products" p
          ${whereClause}
          ${searchClause}
          ORDER BY _similarity DESC, p."createdAt" DESC, p.id ASC
          LIMIT ${limitParam} OFFSET ${offsetParam}
        `, searchTerm, ...filterParams, take, skip);
        return { matchingCount, foundProducts };
      };

      let searchResult: Awaited<ReturnType<typeof runSearch>>;
      const useSimilarity = searchTerm.length > 2 && !this.similarityUnavailable;
      try {
        searchResult = await runSearch(useSimilarity);
      } catch (error) {
        if (!useSimilarity || !this.isMissingSimilarityFunction(error)) throw error;
        this.similarityUnavailable = true;
        this.logger.warn('pg_trgm similarity is unavailable; using literal product search.');
        // Retry exactly once without similarity; other SQL errors remain visible.
        searchResult = await runSearch(false);
      }
      total = searchResult.matchingCount;
      products = searchResult.foundProducts;

      // Fetch related data for each product
      const productIds = products.map(p => p.id);
      const [categories, brands, images, prices] = await Promise.all([
        productIds.length > 0 ? this.prisma.category.findMany({
          where: { id: { in: [...new Set(products.map(p => p.categoryId).filter((id): id is string => !!id))] } },
          select: { id: true, name: true, slug: true }
        }) : [],
        productIds.length > 0 ? this.prisma.brand.findMany({
          where: { id: { in: [...new Set(products.map(p => p.brandId).filter((id): id is string => !!id))] } },
          select: { id: true, name: true, slug: true }
        }) : [],
        productIds.length > 0 ? this.prisma.productImage.findMany({
          where: { productId: { in: productIds } },
          select: { productId: true, url: true, alt: true, type: true, isPrimary: true, sortOrder: true }
        }) : [],
        productIds.length > 0 ? this.prisma.price.findMany({
          where: { productId: { in: productIds } },
          include: { priceList: { select: { id: true, name: true, code: true } } }
        }) : [],
      ]);

      const categoryMap = new Map<string, typeof categories[0]>(categories.map(c => [c.id, c] as const));
      const brandMap = new Map<string, typeof brands[0]>(brands.map(b => [b.id, b] as const));
      const imageMap = pickPrimaryImageByProduct(images);
      const pricesByProduct = new Map<string, typeof prices>();
      for (const price of prices) {
        const arr = pricesByProduct.get(price.productId) || [];
        arr.push(price);
        pricesByProduct.set(price.productId, arr);
      }

      products = products.map(p => ({
        ...p,
        category: categoryMap.get(p.categoryId) || null,
        brand: brandMap.get(p.brandId) || null,
        images: imageMap.get(p.id) ? [imageMap.get(p.id)!] : [],
        prices: pricesByProduct.get(p.id) || [],
        _similarity: undefined, // remove internal field
      }));
    } else {
      // Fallback: búsqueda por contains insensible (search ≤ 2 chars o sin search)
      const where: Prisma.ProductWhereInput = {
        ...(search && {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { sku: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
          ],
        }),
        ...(selectedCategoryIds.length
          ? { categoryId: { in: categoryFilterIds } }
          : categoryId && { categoryId }),
        ...(brandId && { brandId }),
        ...(isVisible !== undefined && { isVisible }),
        ...(isActive !== undefined && { isActive }),
        ...(activeListaOnly && { lista: { isActive: true, archivedAt: null } }),
      };

      const [foundProducts, count] = await Promise.all([
        this.prisma.product.findMany({
          where,
          skip,
          take,
          include: {
            category: { select: { id: true, name: true, slug: true } },
            brand: { select: { id: true, name: true, slug: true } },
            images: primaryImageInclude(),
            prices: {
            include: { priceList: { select: { id: true, name: true, code: true } } },
            },
          },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.product.count({ where }),
      ]);
      products = foundProducts;
      total = count;
    }

    const stockStatusMap = await this.getStockStatusMap(products.map((p) => p.id));

    // Todas las rutas (Prisma y SQL crudo `p.*`) pasan por aqui: sin `products:notes` no sale `catalogInternalNotes`.
    return {
      data: await redactInternalNotes(this.grants, ctx, products.map((p) => ({
        ...p,
        stockStatus: stockStatusMap.get(p.id) ?? 'no_stock_data',
      }))),
      meta: { total, skip, take },
    };
  }

  async findOne(id: string, ctx?: AccessContext) {
    // Solo la concesion global `products:read` (sin cargo, sin Listas); sin ella 403 antes de buscar.
    if (ctx) await assertGlobalGrant(this.grants, 'products:read', ctx);
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        brand: true,
        images: { orderBy: { sortOrder: 'asc' } },
        prices: {
          include: { priceList: true },
        },
        ...this.subcategoryInclude(),
      },
    });

    if (!product) throw new NotFoundException('Producto no encontrado');

    const stock = await this.operational.stock.findUnique({ where: { productId: id } });
    const allowed = ctx ? await this.allowedActions(product, ctx) : undefined;
    return redactInternalNotes(this.grants, ctx, {
      ...this.withClassificationStatus(product),
      stockStatus: stock ? (stock.availableQty > 0 ? 'in_stock' : 'out_of_stock') : 'no_stock_data',
      ...(allowed ? { allowedActions: allowed } : {}),
    });
  }

  /**
   * R2 (price import): creates a HIDDEN draft for an unknown SKU, marked "pending ficha",
   * through the caller's transaction so it commits or rolls back with the price rows and
   * the resolution of the import row. Deliberately NOT `create()`: no LISTA-GENERAL
   * fallback (`listaId` stays null), no lista ACL (the caller authorizes with GLOBAL
   * grants), and it writes history and audit inside `tx`.
   *
   * The draft carries `importStatus: 'pending_enrichment'` and NO `biblioteca` key, so
   * PUBLIC_CATALOG_VISIBILITY (PUBLISHED or library-informational) never exposes it.
   * Throws `SKU_EXISTS` (409) when the normalized SKU already exists; a concurrent insert
   * surfaces as the unique-index violation, which the caller maps to the same code.
   */
  async createPendingSheetDraft(
    tx: Prisma.TransactionClient,
    input: { sku: string; name: string; brandId?: string | null; categoryId?: string | null; sourceRevisionId: string },
    ctx: { userId?: string | null },
  ): Promise<Product> {
    this.assertOwnedTransaction(tx);
    const sku = input.sku?.trim();
    const name = input.name?.trim();
    if (!sku) throw new BadRequestException({ code: 'INVALID_SKU', message: 'La referencia está vacía.' });
    if (!name || name.length > 255) {
      throw new BadRequestException({ code: 'INVALID_NAME', message: 'El nombre debe tener entre 1 y 255 caracteres.' });
    }
    if (await findProductBySku(tx, sku, { id: true })) {
      throw new ConflictException({ code: 'SKU_EXISTS', message: 'Ya existe un producto con ese SKU.' });
    }
    if (input.brandId && !(await tx.brand.findUnique({ where: { id: input.brandId }, select: { id: true } }))) {
      throw new NotFoundException({ code: 'BRAND_NOT_FOUND', message: 'Marca no encontrada.' });
    }
    // A draft from a price import only knows a category: the subcategory is derived when it exists,
    // otherwise the draft stays "por clasificar" (also without brand and/or category). Nothing is created here (C5).
    const classified = await this.classification.assertWritable(tx as unknown as ClassificationDb, { categoryId: input.categoryId ?? undefined, brandId: input.brandId ?? null });

    const product = await tx.product.create({
      data: {
        sku,
        name,
        brandId: input.brandId ?? null,
        ...this.classification.toData(classified),
        listaId: null,
        lifecycleStatus: 'DRAFT',
        publishStatus: 'borrador',
        isActive: false,
        isVisible: false,
        extraAttributes: {
          importStatus: 'pending_enrichment',
          pendingReason: 'created_from_price_import',
          sourceRevisionId: input.sourceRevisionId,
        },
      },
    });

    const meta = {
      productId: product.id, sku: product.sku, source: 'PRICE_IMPORT' as const,
      sourceRef: input.sourceRevisionId, actorId: ctx.userId ?? null,
    };
    await this.changes.record(tx, [
      { ...meta, field: 'created', oldValue: null, newValue: 'pending_enrichment' },
      ...diffFields(null, product, ['sku', 'name', 'brandId', 'categoryId'], meta),
    ]);
    await (this.library.config.mode === 'legacy' ? this.audit.logTx(tx, {
      userId: ctx.userId ?? undefined,
      action: 'price-import-create-draft',
      entity: 'Product',
      entityId: product.id,
      productId: product.id,
      newValues: { sku: product.sku, name: product.name, brandId: product.brandId, categoryId: product.categoryId, revisionId: input.sourceRevisionId, listaId: null },
      result: 'SUCCESS',
    }) : this.appendLibraryEvent(tx, 'PRICE_IMPORT_DRAFT_CREATED', 'Product', product.id, { sku: product.sku, name: product.name, brandId: product.brandId, categoryId: product.categoryId, sourceRevisionId: input.sourceRevisionId }, { userId: ctx.userId ?? undefined, roles: [] }));
    return product;
  }

  async create(dto: CreateProductDto, ctx?: AccessContext) {
    this.library.assertWritesAllowed();
    // Biblioteca autoriza SOLO por la concesion global `products:write` (nunca por cargo ni por Listas).
    if (ctx) await assertGlobalGrant(this.grants, 'products:write', ctx);
    ProductsService.rejectPricesInProductBody(dto.prices);
    // Identidad por SKU normalizado: "abc-1" y "ABC-1" son el mismo producto.
    const existingSku = await findProductBySku(this.prisma, dto.sku, { sku: true });
    // The id lets the caller link to the existing product; the products are never merged by similarity.
    if (existingSku) throw new ConflictException({ code: 'SKU_EXISTS', message: 'Ya existe un producto con ese SKU', existingProductId: existingSku.id });

    const classified = await this.classification.assertWritable(this.prisma as unknown as ClassificationDb, { categoryId: dto.categoryId || undefined, subcategoryId: dto.subcategoryId || undefined, brandId: dto.brandId || null });
    // Pending name: without one the reference is the provisional name (same rule as the price import).
    const name = typeof dto.name === 'string' && dto.name.trim() !== '' ? dto.name : dto.sku.trim();

    // Minimum data is SKU + name: without brand the product is saved as an incomplete draft (never a placeholder brand).
    if (dto.brandId) {
      const brand = await this.prisma.brand.findUnique({ where: { id: dto.brandId } });
      if (!brand) throw new NotFoundException('Marca no encontrada');
    }

    // Resolver y validar specs tipados (nuevo formato) con fallback a legacy
    const specs = this.resolveSpecs(dto.specs, dto.technicalSpecs);
    const extraSpecs = this.resolveSpecs(dto.extraSpecs, dto.extraAttributes);

    // Validar specs
    this.validateSpecs(specs, 'specs');
    this.validateSpecs(extraSpecs, 'extraSpecs');

    // Compatibilidad: toda creación de producto debe quedar asociada a una Lista.
    // Si se envía listaId se valida su existencia; si falta, se asigna LISTA-GENERAL
    // (fallback explícito y documentado para registros legados).  [decisiones 8/14]
    // La Lista también expone defaultVisibility: si no viene dto.isVisible explícito,
    // el producto nuevo hereda la visibilidad por defecto de su Lista.
    const lista = await this.resolveLista(dto.listaId);

    // Product and its history commit or roll back together.
    return this.writeTransaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          sku: dto.sku,
          name,
          description: dto.description,
          ...this.classification.toData(classified),
          brandId: dto.brandId || null,
          listaId: lista.id,
          technicalSpecs: this.prepareSpecsForStorage(specs),
          extraAttributes: this.prepareSpecsForStorage(extraSpecs),
          ...(dto.documents !== undefined && { documents: dto.documents }),
          lifecycleStatus: 'DRAFT',
          // Un producto nuevo SIEMPRE nace en DRAFT (isActive=false, isVisible=false).
          // Los campos legacy isActive/isVisible/publishStatus/publishAt/unpublishAt se
          // ignoran/normalizan para conservar el estado inicial canónico (no generan legacy).
          isActive: false,
          isVisible: false,
        },
        include: {
          category: { select: { id: true, name: true } },
          brand: { select: { id: true, name: true } },
          ...this.subcategoryInclude(),
        },
      });
      await this.recordProductChanges(tx, null, product as never, [...ProductsService.EDIT_HISTORY_FIELDS, 'lifecycleStatus'], 'MANUAL', ctx);

      await this.appendLibraryEvent(tx, 'PRODUCT_CREATED', 'Product', product.id, { sku: product.sku, name: product.name, brandId: product.brandId, categoryId: product.categoryId, listaId: product.listaId, lifecycleStatus: product.lifecycleStatus }, ctx);
      return this.withClassificationStatus(product);
    });
  }

  async update(id: string, dto: UpdateProductDto, ctx?: AccessContext) {
    this.library.assertWritesAllowed();
    if (ctx) await assertGlobalGrant(this.grants, 'products:write', ctx);
    ProductsService.rejectPricesInProductBody(dto.prices);
    // El estado del producto se gestiona vía FSM (POST /api/products/:id/transition).
    // Esta guarda explícita cubre llamadas directas al servicio (sin DTO whitelist).
    const stateKeys = ['isActive', 'isVisible', 'publishStatus', 'publishAt', 'unpublishAt'];
    if (stateKeys.some((key) => (dto as any)[key] !== undefined)) {
      throw new BadRequestException('El estado del producto se gestiona vía POST /transition');
    }

    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Producto no encontrado');

    // Si se reasigna listaId, se autoriza además sobre la nueva Lista.
    let listaId: string | null = product.listaId ?? null;
    if (dto.listaId !== undefined) {
      const newLista = await this.resolveLista(dto.listaId);
      listaId = newLista.id;
    }

    // Solo se valida unicidad si cambia la identidad (SKU normalizado); un cambio
    // de mayúsculas/espacios del propio producto es válido.
    if (dto.sku && normalizeSku(dto.sku) !== normalizeSku(product.sku)) {
      const existing = await findProductBySku(this.prisma, dto.sku, { sku: true });
      if (existing && existing.id !== product.id) {
        throw new ConflictException('Ya existe un producto con ese SKU');
      }
    }

    // Only touched when the caller sends a classification field; categoryId/subcategoryId are never written independently.
    // undefined = unchanged; explicit null = clear (brandId, subcategoryId, categoryId).
    const classified = dto.categoryId || dto.categoryId === null || dto.subcategoryId !== undefined
      ? await this.classification.assertWritable(
        this.prisma as unknown as ClassificationDb,
        { categoryId: dto.categoryId === null ? null : dto.categoryId || undefined, subcategoryId: dto.subcategoryId, brandId: dto.brandId === null ? null : dto.brandId || undefined },
        { categoryId: product.categoryId, subcategoryId: product.subcategoryId, brandId: product.brandId },
      )
      : null;

    if (dto.brandId) {
      const brand = await this.prisma.brand.findUnique({ where: { id: dto.brandId } });
      if (!brand) throw new NotFoundException('Marca no encontrada');
    }

    // Resolver y validar specs tipados (nuevo formato) con fallback a legacy
    const specs = this.resolveSpecs(dto.specs, dto.technicalSpecs);
    const extraSpecs = this.resolveSpecs(dto.extraSpecs, dto.extraAttributes);

    // Validar specs si se proporcionan
    if (dto.specs !== undefined || dto.technicalSpecs !== undefined) {
      this.validateSpecs(specs, 'specs');
    }
    if (dto.extraSpecs !== undefined || dto.extraAttributes !== undefined) {
      this.validateSpecs(extraSpecs, 'extraSpecs');
    }

    const updated = await this.writeTransaction(async (tx) => {
      let before = product;
      if (this.library.config.mode === 'dedicated') {
        await tx.$queryRaw`SELECT id FROM products WHERE id=${id} FOR UPDATE`;
        before = await tx.product.findUniqueOrThrow({ where: { id } });
        if (before.updatedAt.getTime() !== product.updatedAt.getTime() || before.listaId !== product.listaId) throw new ConflictException({ code: 'product-version-conflict', message: 'El producto cambió. Recarga antes de guardar.' });
      }
      const row = await tx.product.update({
      where: { id },
      data: {
        ...(dto.sku && { sku: dto.sku }),
        ...(dto.name && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(classified && this.classification.toData(classified)),
        ...(dto.brandId === null ? { brandId: null } : dto.brandId ? { brandId: dto.brandId } : {}),
        ...(dto.listaId !== undefined && { listaId }),
        ...(dto.specs !== undefined || dto.technicalSpecs !== undefined
          ? { technicalSpecs: this.prepareSpecsForStorage(specs) }
          : {}),
        ...(dto.extraSpecs !== undefined || dto.extraAttributes !== undefined
          ? { extraAttributes: this.prepareSpecsForStorage(extraSpecs) }
          : {}),
        ...(dto.documents !== undefined && { documents: dto.documents }),
      },
      include: {
        category: { select: { id: true, name: true } },
        brand: { select: { id: true, name: true } },
        ...this.subcategoryInclude(),
      },
      });
      await this.recordProductChanges(tx, before, row as never, ProductsService.EDIT_HISTORY_FIELDS, 'MANUAL', ctx);

      if (this.library.config.mode === 'dedicated') await this.revisions?.markPendingFromLive(id, tx as unknown as LibraryPrisma.TransactionClient, { id: ctx?.userId });
      await this.appendLibraryEvent(tx, 'PRODUCT_UPDATED', 'Product', id, { fields: Object.keys(dto), before: JSON.parse(JSON.stringify(before)), after: JSON.parse(JSON.stringify(row)) }, ctx);
      return row;
    });

    // CAT-02 alternativas: la edición legacy deja revisión pendiente; la
    // presentación pública no cambia (lente de revisión activo).
    if (this.library.config.mode === 'legacy') await this.revisions?.markPendingFromLive(id);

    return this.withClassificationStatus(updated);
  }

  /**
   * Despublica un producto (endpoint legacy delegado a la FSM): UNPUBLISH → DRAFT
   * con razón obligatoria (audit 'unpublish').
   */
  async unpublish(id: string, dto: UnpublishProductDto, ctx?: AccessContext) {
    this.library.assertWritesAllowed();
    if (ctx) await this.assertCatalogProductAction(id, 'products:publish', ctx);
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Producto no encontrado');


    return this.transition(id, { event: 'UNPUBLISH', reason: dto.reason }, ctx);
  }

  /**
   * Adaptador legacy: alterna visibilidad traduciendo al contrato canónico.
   */
  async toggleVisibility(id: string, ctx?: AccessContext) {
    this.library.assertWritesAllowed();
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Producto no encontrado');

    const status = this.effectiveLifecycleStatus(product);
    if (status === 'DRAFT') {
      return this.transition(id, { event: 'PUBLISH' }, ctx);
    }
    if (status === 'PUBLISHED') {
      return this.transition(id, { event: 'UNPUBLISH' }, ctx);
    }
    throw new BadRequestException(
      `No se puede alternar la visibilidad en estado ${status}`,
    );
  }

  /**
   * Checklist previo a publicación (documentado). Las Listas ya no existen: ninguna regla las consulta.
   *  (b) Producto activo (isActive).
   *  (c) Al menos 1 precio vigente del producto (validFrom nulo o <= now y validUntil nulo o futuro).
   *  (d) Al menos 1 imagen.
   *  (e) Stock: si existe registro de stock, exige availableQty > 0.
   *      Si NO existe registro de stock, NO se bloquea (decisión documentada).
   * Devuelve la lista de TODOS los requisitos fallidos (mensaje 400 detallado).
   */
  private assertWebBrandAllowed(...labels: unknown[]) {
    if (isWebBrandExcluded(...labels.map((label) => typeof label === 'string' ? label : null))) {
      throw new BadRequestException({
        code: 'WEB_BRAND_EXCLUDED',
        message: 'Dahua e Imou no se pueden publicar en la tienda.',
      });
    }
  }

  private async assertRevisionWebBrandAllowed(content: unknown, currentBrandId: string | null) {
    const snapshot = content as Record<string, unknown> | null;
    this.assertWebBrandAllowed(snapshot?.catalogBrand);
    if (typeof snapshot?.brandId === 'string' && snapshot.brandId !== currentBrandId) {
      const brand = await this.prisma.brand.findUnique({ where: { id: snapshot.brandId }, select: { name: true } });
      this.assertWebBrandAllowed(brand?.name);
    }
  }

  private async validatePublishRequirements(product: {
    id: string;
    listaId: string | null;
    isActive: boolean;
  }): Promise<string[]> {
    const failures: string[] = [];
    const now = new Date();

    // La biblioteca no depende de Listas: ni la Lista de un producto ni su estado bloquean la publicación.

    // (c) Al menos 1 precio vigente del producto (cualquier tarifa).
    // Se mantiene la regla de fondo: el precio debe existir y ser vigente
    // (validFrom <= hoy <= validUntil, límites abiertos con null).
    const priceCount = await this.prisma.price.count({
      where: {
        productId: product.id,
        ...priceValidityWhere(now),
      },
    });
    if (priceCount === 0) {
      failures.push('El producto no tiene al menos un precio vigente');
    }

    // (d) Al menos 1 imagen.
    const imageCount = await this.prisma.productImage.count({ where: { productId: product.id } });
    if (imageCount === 0) {
      failures.push('El producto no tiene al menos una imagen');
    }

    // (e) Stock: solo bloquea si existe registro de stock con availableQty <= 0.
    const stock = await this.operational.stock.findUnique({ where: { productId: product.id } });
    if (stock && stock.availableQty <= 0) {
      failures.push('El producto tiene stock registrado pero sin unidades disponibles (availableQty <= 0)');
    }

    return failures;
  }

  /**
   * Adaptador legacy de publicación/programación (obsoleto, se conserva transitoriamente):
   * - Si `publishAt` es futura: el producto permanece en DRAFT y solo se persiste `publishAt`
   *   (el scheduler aplicará PUBLISH al vencer la fecha).
   * - Si no hay `publishAt` futura: ejecuta la transición canónica PUBLISH (DRAFT → PUBLISHED).
   * - `unpublishAt` se ignora (no existe auto-despublicación).
   */
  async publish(id: string, dto: PublishProductDto, ctx?: AccessContext) {
    this.library.assertWritesAllowed();
    if (ctx) await this.assertCatalogProductAction(id, 'products:publish', ctx);
    const product = await this.prisma.product.findUnique({ where: { id }, include: { brand: { select: { name: true } } } });
    if (!product) throw new NotFoundException('Producto no encontrado');

    const status = this.effectiveLifecycleStatus(product);

    // Cancelación explícita de una publicación programada.
    // Solo válida en DRAFT con publishAt futura activa. No ejecuta transiciones
    // canónicas ni scheduler; conserva el contrato de Borrador.
    if (dto.publishAt === null) {
      if (status !== 'DRAFT') {
        throw new ConflictException('Solo se puede cancelar una programación en un producto en Borrador.');
      }
      const currentPublishAt = product.publishAt ? new Date(product.publishAt) : null;
      if (!currentPublishAt || currentPublishAt <= new Date()) {
        throw new ConflictException('El producto no tiene una publicación programada activa.');
      }

      const updated = await this.updateWithStateHistory(id, product, {
        lifecycleStatus: 'DRAFT',
        isActive: false,
        isVisible: false,
        publishStatus: 'borrador',
        publishAt: null,
        unpublishAt: null,
        publishedAt: null,
        publishedById: null,
        unpublishReason: null,
        // CAT-06: cancelar la programación libera la revisión congelada SOLO
        // si existía pin (no altera la forma del update para filas legacy).
        ...(product.scheduledRevisionId ? { scheduledRevisionId: null } : {}),
      }, ctx, { action: 'PRODUCT_SCHEDULE_CANCELLED', summary: { lifecycleStatus: status, previousPublishAt: currentPublishAt.toISOString() } });
      await this.legacyAudit({
        userId: ctx?.userId,
        action: 'cancel_schedule_publish',
        entity: 'Product',
        entityId: id,
        oldValues: { lifecycleStatus: status, publishAt: currentPublishAt },
        newValues: { lifecycleStatus: status, publishAt: null, isActive: false, isVisible: false },
      });
      await this.logPublicationEvent('UNSCHEDULE', id, product.scheduledRevisionId ?? null, 'ok', ctx?.userId ?? null);
      return updated;
    }

    if (status === 'PUBLISHED') {
      throw new ConflictException('El producto ya está publicado');
    }
    if (status === 'ARCHIVED') {
      throw new BadRequestException('No se puede publicar un producto archivado');
    }


    const publishAt = dto.publishAt ? new Date(dto.publishAt) : null;
    const isFuturePublish = !!publishAt && publishAt > new Date();

    if (!isFuturePublish) {
      return this.transition(id, { event: 'PUBLISH' }, ctx);
    }
    this.assertWebBrandAllowed(product.catalogBrand, product.brand?.name);

    // Programación sobre DRAFT: persiste estado canónico DRAFT completo con publishAt.
    // CAT-06 (T3, MISMO servicio que schedulePublication): programar exige
    // validación vigente AHORA (motor CAT-05 re-ejecutado) y CONGELA la revisión
    // que el scheduler publicará al vencer — caso 1 de la ficha.
    let scheduledRevisionId: string | null | undefined;
    if (this.validation && this.revisions) {
      await this.assertPublicationReady(id, ctx?.userId ?? null, true);
      // Reprogramar vuelve a congelar el estado DE HOY (no el pin anterior).
      scheduledRevisionId = await this.resolvePinnedRevision(product, false);
    }
    const updated = await this.updateWithStateHistory(id, product, {
      lifecycleStatus: 'DRAFT',
      isActive: false,
      isVisible: false,
      publishStatus: 'borrador',
      publishAt,
      unpublishAt: null,
      publishedAt: null,
      unpublishReason: null,
      ...(scheduledRevisionId !== undefined ? { scheduledRevisionId } : {}),
    }, ctx, { action: 'PRODUCT_SCHEDULED', summary: { lifecycleStatus: status, publishAt: publishAt.toISOString() } });
    await this.legacyAudit({
      userId: ctx?.userId,
      action: 'schedule_publish',
      entity: 'Product',
      entityId: id,
      oldValues: { lifecycleStatus: status, publishAt: product.publishAt ?? null },
      newValues: { lifecycleStatus: status, publishAt, isActive: false, isVisible: false },
    });
    await this.logPublicationEvent('SCHEDULE', id, scheduledRevisionId ?? null, 'ok', ctx?.userId ?? null);
    return updated;
  }


  /**
   * Estado FSM efectivo de un producto. Fuente de verdad: `lifecycleStatus`.
   * Fallback a mapeo desde columnas legacy para datos pre-backfill (tests/legacy).
   */
  private effectiveLifecycleStatus(product: {
    lifecycleStatus?: string | null;
    publishStatus?: string | null;
    isActive?: boolean;
    isVisible?: boolean;
    publishAt?: Date | null;
  }): LifecycleStatus {
    const stored = product.lifecycleStatus;
    if (stored) {
      if (LIFECYCLE_STATUSES.includes(stored as LifecycleStatus)) {
        return stored as LifecycleStatus;
      }
      const normalized = this.normalizeLegacyStored(stored);
      if (normalized) return normalized;
    }
    return this.mapLegacyToLifecycle(product);
  }

  /** Normaliza estados legacy almacenados (sin migración de datos) al canónico. */
  private normalizeLegacyStored(status: string): LifecycleStatus | null {
    switch (status.toUpperCase()) {
      case 'READY':
      case 'SCHEDULED':
      case 'HIDDEN':
        return 'DRAFT';
      case 'DISCONTINUED':
        return 'ARCHIVED';
      default:
        return null;
    }
  }

  private mapLegacyToLifecycle(product: {
    publishStatus?: string | null;
    publishAt?: Date | null;
  }): LifecycleStatus {
    const ps = product.publishStatus;
    if (ps === 'archivado') return 'ARCHIVED';
    if (ps === 'publicado') return 'PUBLISHED';
    // 'listo' (READY/SCHEDULED) y 'borrador' → DRAFT.
    return 'DRAFT';
  }

  /** Snapshot de las columnas de estado (lifecycle + espejo legacy) para auditoría. */
  private lifecycleSnapshot(product: {
    lifecycleStatus?: string | null;
    isActive?: boolean;
    isVisible?: boolean;
    publishStatus?: string | null;
    publishAt?: Date | null;
    unpublishAt?: Date | null;
    publishedAt?: Date | null;
    unpublishReason?: string | null;
  }) {
    return this.statePick(product);
  }

  /** Selecciona solo las claves de estado presentes en un objeto (omite undefined). */
  private statePick(source: Record<string, unknown> | null | undefined): Record<string, unknown> {
    const keys = [
      'lifecycleStatus',
      'isActive',
      'isVisible',
      'publishStatus',
      'publishAt',
      'unpublishAt',
      'publishedAt',
      'unpublishReason',
    ];
    const out: Record<string, unknown> = {};
    if (!source) return out;
    for (const key of keys) {
      if (source[key] !== undefined) out[key] = source[key];
    }
    return out;
  }

  /**
   * Dual-write: calcula los campos legacy que espejan el estado destino de la FSM.
   * Mapa espejo (contrato fijado para los 3 estados canónicos):
   *  PUBLISH → isActive=true, isVisible=true, publishStatus='publicado', publishedAt=now
   *  UNPUBLISH → isActive=false, isVisible=false, publishStatus='borrador'
   *  ARCHIVE → isActive=false, isVisible=false, publishStatus='archivado'
   *  RESTORE → isActive=false, isVisible=false, publishStatus='borrador'
   */
  private buildTransitionData(
    event: LifecycleEvent,
    product: { publishedAt?: Date | null; publishStatus?: string | null },
    dto: TransitionProductDto,
    ctx?: AccessContext,
  ): Prisma.ProductUncheckedUpdateInput {
    const now = new Date();

    switch (event) {
      case 'PUBLISH': // DRAFT → PUBLISHED
        return {
          lifecycleStatus: 'PUBLISHED',
          isActive: true,
          isVisible: true,
          publishStatus: 'publicado',
          publishedAt: product.publishedAt ?? now,
          publishAt: null,
          unpublishAt: null,
          unpublishReason: null,
          publishedById: ctx?.userId ?? null,
        };
      case 'UNPUBLISH': // PUBLISHED → DRAFT (elimina programación futura; reason como auditoría)
        return {
          lifecycleStatus: 'DRAFT',
          isActive: false,
          isVisible: false,
          publishStatus: 'borrador',
          publishAt: null,
          publishedAt: null,
          unpublishAt: null,
          unpublishReason: dto.reason?.trim() ? dto.reason : null,
        };
      case 'ARCHIVE': // DRAFT|PUBLISHED → ARCHIVED (elimina publishAt; motivo+confirm obligatorios)
        return {
          lifecycleStatus: 'ARCHIVED',
          isActive: false,
          isVisible: false,
          publishStatus: 'archivado',
          publishAt: null,
          publishedAt: null,
          unpublishAt: null,
          unpublishReason: dto.reason?.trim() ? dto.reason : null,
        };
      case 'RESTORE': // ARCHIVED → DRAFT (nunca publica automáticamente)
        return {
          lifecycleStatus: 'DRAFT',
          isActive: false,
          isVisible: false,
          publishStatus: 'borrador',
          publishAt: null,
          publishedAt: null,
          unpublishAt: null,
          unpublishReason: dto.reason?.trim() ? dto.reason : null,
        };
      default:
        throw new BadRequestException(`Evento FSM sin datos de espejo: ${event}`);
    }
  }

  /**
   * Acciones FSM permitidas para un producto según su estado actual y las
   * concesiones globales del usuario (publish / write). No lanza errores: es informativo
   * para que la UI muestre solo acciones válidas.
   */
  async allowedActions(
    product: { id: string; lifecycleStatus?: string | null; publishStatus?: string | null; isActive?: boolean; isVisible?: boolean; publishAt?: Date | null },
    ctx?: AccessContext,
  ): Promise<LifecycleEvent[]> {
    if (!ctx?.userId) return [];
    const status = this.effectiveLifecycleStatus(product);
    const allowed: LifecycleEvent[] = [];

    for (const [event, rule] of Object.entries(TRANSITION_RULES)) {
      if (!rule) continue;
      if (!rule.from.includes(status)) continue;
      if (!(await hasGlobalGrant(this.grants, ProductsService.grantForEvent(event), ctx))) continue;
      allowed.push(event as LifecycleEvent);
    }

    return allowed;
  }

  /**
   * Ejecuta un evento de la FSM sobre un producto. Fuente única de verdad para
   * el ciclo de vida. Guardas en orden: RBAC → ACL → reason/confirm/publishAt →
   * transición válida → checklist (PUBLISH) → dual-write + auditoría.
   */
  async transition(id: string, dto: TransitionProductDto, ctx?: AccessContext) {
    this.library.assertWritesAllowed();
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Producto no encontrado');


    return this.doTransition(id, dto, ctx, false);
  }

  /**
   * Scheduler P6 — tick del cron cada minuto.
   * Publica los productos en DRAFT cuyo publishAt ya venció, aplicando
   * internamente la transición canónica PUBLISH (re-valida el checklist).
   * Idempotencia: la query candidata es condicional (lifecycleStatus + fecha) y
   * cada transición re-chequea el estado actual antes de escribir (doTransition →
   * rule.from). El lock en memoria descarta ticks solapados. NO existe
   * auto-despublicación (unpublishAt se conserva como columna sin uso).
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async handleLifecycleTick(): Promise<SchedulerTickReport> {
    const runAt = new Date();
    if (this.lifecycleTickRunning) {
      this.logger.warn('[scheduler] tick anterior aún en curso; se descarta este tick');
      return { runAt, skipped: true, publishOk: 0, publishFailed: [] };
    }
    // Con la biblioteca congelada (migración/respaldo) el scheduler no publica nada.
    if (this.library.config.writesFrozen) return { runAt, skipped: true, publishOk: 0, publishFailed: [] };
    this.lifecycleTickRunning = true;
    try {
      const publishes = await this.processScheduledPublishes();
      return { runAt, skipped: false, ...publishes };
    } finally {
      this.lifecycleTickRunning = false;
    }
  }

  /**
   * Publica los productos programados (DRAFT con publishAt vencido) aplicando
   * la transición canónica PUBLISH. `doTransition` re-valida el checklist: si
   * falla, NO cambia estado y se cuenta en el reporte con los motivos.
   */
  async processScheduledPublishes(): Promise<{
    publishOk: number;
    publishFailed: Array<{ id: string; reasons: string }>;
  }> {
    this.library.assertWritesAllowed();
    const now = new Date();
    const due = (await this.prisma.product.findMany({
      where: { lifecycleStatus: 'DRAFT', publishAt: { lte: now } },
      select: { id: true, sku: true, name: true },
    })) ?? [];

    let publishOk = 0;
    const publishFailed: Array<{ id: string; reasons: string }> = [];

    for (const product of due) {
      try {
        await this.doTransition(product.id, { event: 'PUBLISH' }, undefined, true);
        publishOk += 1;
      } catch (error) {
        const reasons = error instanceof Error ? error.message : 'Error interno';
        publishFailed.push({ id: product.id, reasons });
        // CAT-06 (caso 2): el disparo bloqueado NUNCA se pierde en silencio.
        // Si el bloqueo vino del motor, `assertPublicationReady` ya registró
        // `SCHEDULE_BLOCKED` con las incidencias; aquí solo se cubren los
        // bloqueos del checklist legacy u otros fallos del tick.
        const code = (error as { response?: { code?: string } })?.response?.code;
        if (code !== 'publication-not-ready') {
          await this.logPublicationEvent('SCHEDULE_BLOCKED', product.id, null, 'blocked', null, { reason: reasons });
        }
        this.logger.warn(
          `[scheduler] publicación programada de "${product.name}" (${product.sku}): ${reasons}`,
        );
      }
    }

    return { publishOk, publishFailed };
  }

  private async doTransition(
    id: string,
    dto: TransitionProductDto,
    ctx?: AccessContext,
    skipHumanAccessChecks = false,
  ) {
    // Permiso por concesion global segun el evento (publish: PUBLISH/UNPUBLISH; write: ARCHIVE/RESTORE).
    if (!skipHumanAccessChecks && ctx) {
      await assertGlobalGrant(this.grants, ProductsService.grantForEvent(dto.event), ctx);
    }
    const product = await this.prisma.product.findUnique({ where: { id }, include: { brand: { select: { name: true } } } });
    if (!product) throw new NotFoundException('Producto no encontrado');

    const event = dto.event;
    const rule = TRANSITION_RULES[event];

    if (!rule) {
      throw new BadRequestException(`Evento FSM inválido: ${event}`);
    }

    const status = this.effectiveLifecycleStatus(product);

    // Guardas de datos: reason / confirm.
    if (rule.guard.reasonRequired && !dto.reason?.trim()) {
      throw new BadRequestException(`El evento ${event} requiere un motivo (reason)`);
    }
    if (rule.guard.confirmRequired && dto.confirm !== true) {
      throw new BadRequestException(`El evento ${event} requiere confirmación (confirm: true)`);
    }

    // Transición válida según estado actual.
    if (!rule.from.includes(status)) {
      throw new BadRequestException(
        `No se puede pasar de ${status} a ${rule.to} con el evento ${event}`,
      );
    }
    // Checklist de publicación (P5): solo PUBLISH valida requisitos comerciales.
    if (event === 'PUBLISH') {
      this.assertWebBrandAllowed(product.catalogBrand, product.brand?.name);
      const failures = await this.validatePublishRequirements(product);
      if (failures.length > 0) {
        const detail = failures.map((f, i) => `${i + 1}) ${f}`).join('; ');
        throw new BadRequestException(`No se puede publicar. Requisitos incumplidos: ${detail}`);
      }
      // CAT-06 (P2, diseño §6): ANTES de escribir se re-ejecuta el motor de
      // validación CAT-05 sobre el estado vivo — nunca se confía en un informe
      // guardado. Resultado bloqueante u obsoleto → 409 `publication-not-ready`
      // con cero escritura (caso 2 de la ficha). Con specs de 6 argumentos
      // (motor ausente) se preserva el comportamiento previo.
      if (this.validation) {
        await this.assertPublicationReady(id, skipHumanAccessChecks ? null : (ctx?.userId ?? null), skipHumanAccessChecks);
      }
    }

    const data = this.buildTransitionData(event, product, dto, ctx);
    const oldValues = this.lifecycleSnapshot(product);

    // CAT-06 (P1/T1/T2): PUBLISH pinea la revisión EXACTA y UNPUBLISH despinea,
    // en UNA transacción revisión+producto+historial (caso 3: un fallo no deja
    // mezcla de datos). Sin el mecanismo de revisiones inyectado (construcciones
    // legacy de los specs), se mantiene la escritura única anterior.
    if (this.validation && this.revisions && (event === 'PUBLISH' || event === 'UNPUBLISH')) {
      return this.applyTransitionWithPin(id, product, event, data, oldValues, ctx, skipHumanAccessChecks);
    }

    const updated = await this.updateWithStateHistory(id, product, data, ctx, {
      action: `PRODUCT_${event}`,
      summary: { from: status, to: rule.to, event },
    });

    await this.legacyAudit({
      userId: ctx?.userId,
      action: EVENT_AUDIT_ACTION[event],
      entity: 'Product',
      entityId: id,
      oldValues,
      // Los valores realmente escritos (data) prevalecen sobre la fila devuelta.
      newValues: { ...this.statePick(updated), ...this.statePick(data) },
    });

    const allowed = ctx ? await this.allowedActions(updated, ctx) : undefined;
    return allowed ? { ...updated, allowedActions: allowed } : updated;
  }

  /**
   * CAT-06 (P2): re-ejecuta el motor (via `runFresh`, que persiste el informe en
   * la revisión de trabajo) y bloquea con 409 si hay incidencias `error`. La
   * programación que falla al vencer queda registrada como `SCHEDULE_BLOCKED`
   * — el scheduler nunca falla en silencio.
   */
  private async assertPublicationReady(productId: string, actorId: string | null, fromScheduler = false): Promise<void> {
    const { report } = await this.validation!.runFresh(productId);
    if (report.status === 'CON_PROBLEMAS') {
      const errors = report.issues.filter((i) => i.severity === 'error');
      await this.logPublicationEvent(fromScheduler ? 'SCHEDULE_BLOCKED' : 'PUBLISH', productId, report.revisionId, 'blocked', actorId, report.issues);
      throw new ConflictException({
        code: 'publication-not-ready',
        message: 'Publicación bloqueada: la validación vigente tiene problemas bloqueantes (o quedó obsoleta al editar).',
        feedback: errors.slice(0, 8).map((i) => `${i.code} (${i.section}): ${i.message}`),
      });
    }
  }

  /**
   * CAT-06 (caso 1): la revisión a pinear. Prioridad a la congelada al programar
   * (`scheduledRevisionId`) — se publica ESA, nunca el borrador posterior. Si no
   * (publicación inmediata), la revisión de trabajo vigente; si no hay, se foto-
   * graphía el estado vivo con el mecanismo CAT-02 (`markPendingFromLive`).
   */
  private async resolvePinnedRevision(
    product: Pick<Product, 'id' | 'scheduledRevisionId' | 'brandId'>,
    preferScheduled = true,
  ): Promise<string | null> {
    if (preferScheduled && product.scheduledRevisionId) {
      const frozen = await this.prisma.productRevision.findUnique({
        where: { id: product.scheduledRevisionId },
        select: { id: true, productId: true, content: true },
      });
      if (frozen && frozen.productId === product.id) {
        await this.assertRevisionWebBrandAllowed(frozen.content, product.brandId);
        return frozen.id;
      }
      // Defensivo: la revisión congelada ya no existe (borrada a mano) → se
      // resuelve por el estado vivo; jamás se publica `null` a ciegas.
    }
    const draft = await this.prisma.productRevision.findFirst({
      where: { productId: product.id, status: { not: 'PUBLICADA' as never } },
      orderBy: { version: 'desc' },
      select: { id: true, content: true },
    });
    if (draft) {
      await this.assertRevisionWebBrandAllowed(draft.content, product.brandId);
      return draft.id;
    }
    const created = await this.revisions!.markPendingFromLive(product.id);
    return created?.id ?? null;
  }

  /**
   * CAT-06 (P1): PUBLISH en una sola transacción — la revisión pineada pasa a
   * `PUBLICADA` (inmutable desde ya) y el producto queda publicado apuntando
   * `publicRevisionId` a esa revisión exacta (lente CAT-02: la tienda muestra la
   * revisión, no las columnas vivas). UNPUBLISH despinea (T1): el producto
   * vuelve a DRAFT y `publicRevisionId := null`; la revisión publicada anterior
   * permanece como historial. `scheduledRevisionId` se consume/cancela siempre.
   */
  private async applyTransitionWithPin(
    id: string,
    product: Product,
    event: 'PUBLISH' | 'UNPUBLISH',
    data: Prisma.ProductUncheckedUpdateInput,
    oldValues: Record<string, unknown>,
    ctx?: AccessContext,
    fromScheduler = false,
  ) {
    const pinnedId = event === 'PUBLISH' ? await this.resolvePinnedRevision(product) : null;
    const previousPublicRevisionId = product.publicRevisionId ?? null;

    const eventSummary = { event, from: this.effectiveLifecycleStatus(product), pinnedRevisionId: pinnedId, previousPublicRevisionId } as LibraryPrisma.InputJsonObject;
    const updated = await this.writeTransaction(async (tx) => {
      if (event === 'PUBLISH') {
        if (pinnedId) {
          await tx.productRevision.update({
            where: { id: pinnedId },
            data: { status: 'PUBLICADA', publishedAt: new Date() },
          });
        }
        const row = await tx.product.update({
          where: { id },
          data: { ...data, publicRevisionId: pinnedId, scheduledRevisionId: null },
        });
        await this.recordProductChanges(tx, product, row as never, ProductsService.STATE_HISTORY_FIELDS, 'LIFECYCLE', ctx);
        await this.appendLibraryEvent(tx, `PRODUCT_${event}`, 'Product', id, eventSummary, ctx);
        return row;
      }
      const row = await tx.product.update({
        where: { id },
        data: { ...data, publicRevisionId: null, scheduledRevisionId: null },
      });
      await this.recordProductChanges(tx, product, row as never, ProductsService.STATE_HISTORY_FIELDS, 'LIFECYCLE', ctx);
      await this.appendLibraryEvent(tx, `PRODUCT_${event}`, 'Product', id, eventSummary, ctx);
      return row;
    });

    await this.legacyAudit({
      userId: ctx?.userId,
      action: EVENT_AUDIT_ACTION[event],
      entity: 'Product',
      entityId: id,
      oldValues,
      newValues: { ...this.statePick(updated), ...this.statePick(data) },
    });
    await this.logPublicationEvent(
      event === 'PUBLISH' ? (fromScheduler ? 'SCHEDULE_PUBLISHED' : 'PUBLISH') : 'UNPUBLISH',
      id,
      event === 'PUBLISH' ? pinnedId : previousPublicRevisionId,
      'ok',
      ctx?.userId ?? null,
    );

    const allowed = ctx ? await this.allowedActions(updated, ctx) : undefined;
    return allowed ? { ...updated, allowedActions: allowed } : updated;
  }

  /**
   * CAT-06 (P4): historial de publicación (`publication_events`). Nunca rompe la
   * transición principal: si el registro falla se avisa (la auditoría sigue
   * siendo el registro canónico del cambio de estado).
   */
  private async logPublicationEvent(
    action: string,
    productId: string,
    revisionId: string | null,
    result: 'ok' | 'blocked' | 'failed',
    actorId: string | null,
    issues?: unknown,
  ): Promise<void> {
    try {
      await this.prisma.publicationEvent.create({
        data: {
          productId,
          revisionId,
          action,
          result,
          actorId,
          issues: issues === undefined ? undefined : (issues as Prisma.InputJsonValue),
        },
      });
    } catch (error) {
      this.logger.warn(
        `[publication] No se pudo registrar el historial ${action}/${productId}: ${error instanceof Error ? error.message : 'error interno'}`,
      );
    }
  }
  async schedulePublication(
    id: string,
    dto: SchedulePublicationDto,
    ctx: AccessContext,
  ): Promise<Product> {
    this.library.assertWritesAllowed();
    await this.assertCatalogProductAction(id, 'products:publish', ctx);
    const product = await this.prisma.product.findUnique({ where: { id }, include: { brand: { select: { name: true } } } });
    if (!product) throw new NotFoundException('Producto no encontrado');
    const status = this.effectiveLifecycleStatus(product);
    if (status === 'PUBLISHED') {
      throw new ConflictException('El producto ya esta publicado');
    }
    if (status === 'ARCHIVED') {
      throw new BadRequestException('No se puede publicar un producto archivado');
    }
    if (status !== 'DRAFT') {
      throw new BadRequestException(`No se puede programar la publicacion en estado ${status}`);
    }
    if (!dto.publishAt) {
      throw new BadRequestException('Se requiere publishAt');
    }
    const publishAt = new Date(dto.publishAt);
    if (Number.isNaN(publishAt.getTime())) {
      throw new BadRequestException('publishAt no es una fecha ISO valida');
    }
    if (publishAt <= new Date()) {
      throw new BadRequestException('publishAt debe ser una fecha futura');
    }
    this.assertWebBrandAllowed(product.catalogBrand, product.brand?.name);
    const previous = product.publishAt ? new Date(product.publishAt) : null;
    // CAT-06 (T3, mismo servicio que la ruta legacy): programar exige validación
    // vigente AHORA y congela la revisión que el scheduler publicará al vencer
    // (caso 1: publica la revisión programada, NUNCA el borrador posterior).
    let scheduledRevisionId: string | null | undefined;
    if (this.validation && this.revisions) {
      await this.assertPublicationReady(id, ctx.userId, true);
      scheduledRevisionId = await this.resolvePinnedRevision(product, false);
    }
    // La FSM es la fuente de verdad de isActive/isVisible/lifecycleStatus/publishStatus.
    // Este helper solo persiste publishAt, sin escribir directamente isActive/isVisible.
    const updated = await this.persistScheduledPublishAt(id, product, publishAt, ctx, scheduledRevisionId);
    await this.legacyAudit({
      userId: ctx.userId,
      action: 'schedule_publish',
      entity: 'Product',
      entityId: id,
      oldValues: { lifecycleStatus: status, publishAt: previous },
      newValues: { lifecycleStatus: status, publishAt, publishStatus: product.publishStatus ?? 'borrador' },
      result: 'SUCCESS',
    });
    await this.logPublicationEvent('SCHEDULE', id, scheduledRevisionId ?? null, 'ok', ctx.userId);
    return updated;
  }
  /**
   * Cancela una programacion de publicacion pendiente en DRAFT.
   * Solo elimina publishAt; NO despublica ni toca isActive/isVisible (derivados de FSM).
   */
  async cancelScheduledPublication(
    id: string,
    ctx: AccessContext,
  ): Promise<Product> {
    this.library.assertWritesAllowed();
    await this.assertCatalogProductAction(id, 'products:publish', ctx);
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Producto no encontrado');
    const status = this.effectiveLifecycleStatus(product);
    if (status !== 'DRAFT') {
      throw new ConflictException('Solo se puede cancelar una programacion en un producto en Borrador.');
    }
    const current = product.publishAt ? new Date(product.publishAt) : null;
    if (!current || current <= new Date()) {
      throw new ConflictException('El producto no tiene una publicacion programada activa.');
    }
    // CAT-06: cancelar la programación libera la revisión congelada SOLO si
    // existía pin (la forma del update legacy se conserva).
    const updated = await this.updateWithStateHistory(
      id, product, { publishAt: null, ...(product.scheduledRevisionId ? { scheduledRevisionId: null } : {}) }, ctx,
      { action: 'PRODUCT_SCHEDULE_CANCELLED', summary: { lifecycleStatus: status, previousPublishAt: current.toISOString() } },
    );
    await this.legacyAudit({
      userId: ctx.userId,
      action: 'cancel_schedule_publish',
      entity: 'Product',
      entityId: id,
      oldValues: { lifecycleStatus: status, publishAt: current },
      newValues: { lifecycleStatus: status, publishAt: null },
      result: 'SUCCESS',
    });
    await this.logPublicationEvent('UNSCHEDULE', id, product.scheduledRevisionId ?? null, 'ok', ctx.userId);
    return updated;
  }
  /**
   * Helper canonico de programacion: persiste unicamente publishAt (y publishedAt: null
   * al programar) preservando isActive/isVisible/lifecycleStatus/publishStatus de la FSM.
   * Reprogramar reemplaza la fecha pendiente.
   */
  private async persistScheduledPublishAt(
    id: string,
    before: Product,
    publishAt: Date,
    ctx: AccessContext,
    scheduledRevisionId?: string | null,
  ): Promise<Product> {
    return this.updateWithStateHistory(id, before, {
      publishAt,
      publishedAt: null,
      ...(scheduledRevisionId !== undefined ? { scheduledRevisionId } : {}),
    }, ctx, { action: 'PRODUCT_SCHEDULED', summary: { lifecycleStatus: before.lifecycleStatus ?? null, publishAt: publishAt.toISOString() } });
  }
  /**
   * Bulk de transiciones: procesa producto a producto (sin transacción global).
   * Los fallos de un producto NO bloquean el resto. Devuelve
   * { applied, rejected } (el interceptor global lo envuelve en { data }).
   */
  async bulkTransition(ids: string[], dto: TransitionProductDto, ctx?: AccessContext) {
    this.library.assertWritesAllowed();
    const applied: { id: string; lifecycleStatus: string }[] = [];
    const rejected: { id: string; reason: string }[] = [];

    for (const id of ids) {
      try {
        const result = await this.transition(id, dto, ctx);
        applied.push({ id, lifecycleStatus: result.lifecycleStatus });
      } catch (error) {
        rejected.push({
          id,
          reason: error instanceof Error ? error.message : 'Error interno',
        });
      }
    }

    return { applied, rejected };
  }

  /**
   * Lista productos programados (publishStatus 'listo') con publishAt en el rango
   * [from, to]. Si no vienen from/to, usa [now, now+7 días]. También aplica lazy unpublish.
   */
  async findPublishScheduled(from?: string, to?: string) {
    const now = new Date();
    const fromDate = from ? new Date(from) : now;
    const toDate = to ? new Date(to) : new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const products = (await this.prisma.product.findMany({
      where: {
        lifecycleStatus: 'DRAFT',
        publishAt: { gte: fromDate, lte: toDate },
      },
      select: {
        id: true,
        sku: true,
        name: true,
        publishAt: true,
        lista: { select: { id: true, name: true, code: true } },
      },
      orderBy: { publishAt: 'asc' },
    })) ?? [];

    return { data: products };
  }

  /**
   * Borrado físico (P4): concesión global `products:delete`,
   * confirmación explícita (confirm: true)
   * y clave maestra OBLIGATORIA si el producto tiene datos asociados (precios,
   * imágenes, stock, auditoría u órdenes de compra que lo referencien).
   * El evento DELETE es válido desde cualquier estado FSM (comportamiento actual
   * conservado). Se audita 'delete' con oldValues ANTES del borrado físico.
   */
  async remove(id: string, dto?: DeleteProductDto, ctx?: AccessContext) {
    this.library.assertWritesAllowed();
    // Borrado fisico: solo con la concesion global `products:delete` (nunca por cargo ni por Listas).
    if (ctx) await assertGlobalGrant(this.grants, 'products:delete', ctx);
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Producto no encontrado');


    // Guarda de confirmación: el borrado físico es destructivo e irreversible.
    if (dto?.confirm !== true) {
      throw new BadRequestException('Debes confirmar el borrado físico con confirm: true');
    }

    // Con la biblioteca dedicada, un producto con referencias de proveedor o costos no se borra (FK RESTRICT del modelo): 409 claro en vez de un error de base.
    if (this.library.config.mode === 'dedicated') {
      const db = this.prisma as unknown as { providerEquivalence: { count(a: unknown): Promise<number> }; supplierCost: { count(a: unknown): Promise<number> } };
      const [references, costs] = await Promise.all([db.providerEquivalence.count({ where: { productId: id } }), db.supplierCost.count({ where: { productId: id } })]);
      if (references > 0 || costs > 0) {
        throw new ConflictException({ code: 'PRODUCT_HAS_PROVIDER_DATA', message: `El producto tiene ${references} referencia(s) de proveedor y ${costs} costo(s) de compra: retíralos antes de borrarlo.` });
      }
    }

    // Datos asociados → exige la clave maestra (patrón Listas/removeLista).
    const [priceCount, imageCount, stock, auditCount] = await Promise.all([
      this.prisma.price.count({ where: { productId: id } }),
      this.prisma.productImage.count({ where: { productId: id } }),
      this.operational.stock.findUnique({ where: { productId: id } }),
      this.operational.auditLog.count({ where: { entity: 'Product', entityId: id } }),
    ]);

    // Auditoría ANTES del borrado físico (legacy): deja constancia del producto eliminado.
    // En modo dedicado el evento se escribe dentro de la misma transacción del borrado.
    await this.legacyAudit({
      userId: ctx?.userId,
      action: 'delete',
      entity: 'Product',
      entityId: id,
      oldValues: {
        sku: product.sku,
        name: product.name,
        lifecycleStatus: product.lifecycleStatus ?? null,
        isActive: product.isActive,
        isVisible: product.isVisible,
        publishStatus: product.publishStatus ?? null,
      },
    });

    const images = await this.prisma.productImage.findMany({ where: { productId: id } });

    await this.writeTransaction(async (tx) => {
      await tx.price.deleteMany({ where: { productId: id } });
      await tx.productImage.deleteMany({ where: { productId: id } });
      await tx.product.delete({ where: { id } });
      await this.appendLibraryEvent(tx, 'PRODUCT_DELETED', 'Product', id, {
        sku: product.sku, name: product.name, lifecycleStatus: product.lifecycleStatus ?? null, precios: priceCount, imagenes: imageCount,
      }, ctx);
    });

    // Con la biblioteca dedicada el borrado ya no cascadea hacia el inventario operativo (otra base): se retira aquí.
    // No es atómico entre bases; un fallo deja una fila de stock sin producto (efecto no probado; riesgo registrado en docs/biblioteca-dominio/README.md).
    if (this.library.config.mode === 'dedicated') await this.operational.stock.deleteMany({ where: { productId: id } });

    for (const image of images) {
      await this.files.deleteByUrl(image.url);
    }

    return { message: 'Producto eliminado exitosamente' };
  }


  /**
   * Sube una imagen para un producto y registra la fila ProductImage.
   * CAT-04 (D5, caso 3): valida tipo declarado (jpeg/png/webp/gif), tamaño
   * (8 MB) y **contenido real** (firma mágica); bytes y fila se crean en UNA
   * transacción — un fallo de asociación no deja huérfanos. §4: con concesiones
   * exige la acción `products:write` (transición D5).
   */
  /** Concesion global de panel requerida por cada evento FSM (nunca por cargo ni por Lista). */
  private static grantForEvent(event: string): string {
    return event === 'PUBLISH' || event === 'UNPUBLISH' ? 'products:publish' : 'products:write';
  }

  /** Los precios solo cambian por carga masiva o desde la ficha: el cuerpo de POST/PUT /products no los acepta. */
  private static rejectPricesInProductBody(prices?: unknown[]): void {
    if (Array.isArray(prices) && prices.length > 0) {
      throw new BadRequestException('Los precios solo se cambian por carga masiva o desde la ficha del producto.');
    }
  }

  /** Exige la concesion global `actionId` y que el producto exista (403 antes que 404). */
  private async assertCatalogProductAction(id: string, actionId: string, ctx: AccessContext): Promise<void> {
    await assertGlobalGrant(this.grants, actionId, ctx);
    const product = await this.prisma.product.findUnique({ where: { id }, select: { id: true } });
    if (!product) throw new NotFoundException('Producto no encontrado');
  }

  async uploadImage(
    productId: string,
    file: Express.Multer.File,
    isPrimary = false,
    ctx?: AccessContext,
  ) {
    this.library.assertWritesAllowed();
    if (ctx) await assertGlobalGrant(this.grants, 'products:write', ctx);
    const product = await this.prisma.product.findUnique({ where: { id: productId }, select: { id: true } });
    if (!product) throw new NotFoundException('Producto no encontrado');

    if (!file) {
      throw new BadRequestException('Archivo requerido en el campo "file"');
    }

    if (!ALLOWED_IMAGE_MIMETYPES[file.mimetype]) {
      throw new BadRequestException('Tipo de archivo no permitido. Use JPEG, PNG, WEBP o GIF.');
    }

    if (file.size > MAX_IMAGE_SIZE) {
      throw new BadRequestException('El archivo excede el tamaño máximo de 8MB');
    }

    // CAT-04 (G1): el tipo REAL se comprueba por firma mágica — el MIME es solo
    // una declaración del cliente.
    const detected = detectKind(file.buffer);
    if (detected !== 'IMAGE') {
      throw new BadRequestException({
        code: 'asset-type-mismatch',
        message: 'El contenido real del archivo no es una imagen.',
        feedback: [`asset-type-mismatch: contenido detectado ${detected}, declarado ${file.mimetype}`],
      });
    }

    // CAT-04 (D5): todo o nada — el archivo y su asociación viajan juntos.
    const image = await this.writeTransaction(async (tx) => {
      if (this.library.config.mode === 'dedicated') await tx.$queryRaw`SELECT id FROM products WHERE id=${productId} FOR UPDATE`;
      const { url } = await this.files.store(file.buffer, file.mimetype, {
        tx,
        actor: { id: ctx?.userId },
        originalName: file.originalname ?? null,
        ownerProductId: productId,
      });
      if (isPrimary) {
        await tx.productImage.updateMany({
          where: { productId, isPrimary: true },
          data: { isPrimary: false },
        });
      }
      const image = await tx.productImage.create({
        data: {
          productId,
          url,
          alt: file.originalname || null,
          isPrimary,
          sortOrder: 0,
        },
      });
      if (this.library.config.mode === 'dedicated') {
        await this.revisions?.markPendingFromLive(productId, tx as unknown as LibraryPrisma.TransactionClient, { id: ctx?.userId });
      }
      await this.appendLibraryEvent(tx, 'PRODUCT_IMAGE_ADDED', 'ProductImage', image.id, { productId, url: image.url, isPrimary: image.isPrimary }, ctx);
      return image;
    });
    if (this.library.config.mode === 'legacy') await this.revisions?.markPendingFromLive(productId);
    return image;
  }

  /**
   * CAT-04 (D5): subida verificada de activos del producto.
   *  - IMAGE: delega en `uploadImage` (transacción con ProductImage).
   *  - DOCUMENT: guarda el archivo (dueño = producto) y devuelve su URL y su
   *    registro de activos (tamaño real, sha256, tipo detectado) para asociarlo
   *    en la ficha; el recurso con licencia pasa a PRIVADO al guardar la ficha.
   *  - FIRMWARE: **fuera de alcance** — el diseño :267 exige antes inventario
   *    de formatos, lista permitida, tamaño máximo, origen y revisión de
   *    seguridad (insumo externo). No se inventa; se responde con motivo.
   */
  async uploadAsset(
    productId: string,
    kind: 'IMAGE' | 'DOCUMENT' | 'FIRMWARE',
    file: Express.Multer.File,
    ctx?: AccessContext,
  ) {
    this.library.assertWritesAllowed();
    if (kind === 'FIRMWARE') {
      throw new BadRequestException({
        code: 'firmware-upload-deferred',
        message:
          'La subida de firmware está diferida: requiere inventario de formatos, lista permitida, tamaño máximo, origen y revisión de seguridad (diseño :267).',
        feedback: ['firmware-upload-deferred: pendiente de insumo externo (inventario de formatos)'],
      });
    }
    if (kind === 'IMAGE') {
      const image = await this.uploadImage(productId, file, false, ctx);
      return { kind: 'IMAGE' as const, image };
    }

    if (ctx) await assertGlobalGrant(this.grants, 'products:write', ctx);
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });
    if (!product) throw new NotFoundException('Producto no encontrado');
    if (!file) throw new BadRequestException('Archivo requerido en el campo "file"');
    if (file.size > MAX_DOCUMENT_SIZE) {
      throw new BadRequestException('El documento excede el tamaño máximo de 16MB');
    }
    const detected = detectKind(file.buffer);
    if (!declaredMatchesDetected(file.mimetype, detected)) {
      throw new BadRequestException({
        code: 'asset-type-mismatch',
        message: 'El tipo declarado no coincide con el contenido real del documento.',
        feedback: [`asset-type-mismatch: contenido detectado ${detected}, declarado ${file.mimetype}`],
      });
    }
    const { id, url, detectedKind } = await this.files.store(file.buffer, file.mimetype, {
      originalName: file.originalname ?? null,
      ownerProductId: productId,
      actor: { id: ctx?.userId },
    });
    return {
      kind: 'DOCUMENT' as const,
      id,
      url,
      asset: { sizeBytes: file.size, sha256: sha256Hex(file.buffer), detectedKind },
    };
  }

  /**
   * Elimina una imagen: borra el registro; los bytes se RETIENEN si cualquier
   * referencia viva o histórica (imágenes, recursos, documents, contenido de
   * revisiones) los sigue usando — CAT-04 D3 (diseño :212/:345: «sustituir no
   * rompe la revisión pública anterior»). La retención se audita; nunca es 409.
   */
  async deleteImage(imageId: string, ctx?: AccessContext) {
    this.library.assertWritesAllowed();
    const image = await this.prisma.productImage.findUnique({ where: { id: imageId } });
    if (!image) throw new NotFoundException('Imagen no encontrada');

    if (ctx) await this.assertCatalogProductAction(image.productId, 'products:write', ctx);

    if (this.library.config.mode === 'dedicated') {
      return this.writeTransaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM products WHERE id=${image.productId} FOR UPDATE`;
        const release = await this.files.release(image.url, { userId: ctx?.userId, excludeImageId: imageId, tx });
        await tx.productImage.delete({ where: { id: imageId } });
        await this.revisions?.markPendingFromLive(image.productId, tx as unknown as LibraryPrisma.TransactionClient, { id: ctx?.userId });
        await this.appendLibraryEvent(tx, 'PRODUCT_IMAGE_DELETED', 'ProductImage', imageId, { productId: image.productId, url: image.url, retained: !release.deleted }, ctx);
        return { message: release.deleted ? 'Imagen eliminada exitosamente' : 'Imagen eliminada; los bytes se conservan porque siguen referenciados', retained: !release.deleted };
      });
    }
    const release = await this.files.release(image.url, { userId: ctx?.userId, excludeImageId: imageId });

    await this.prisma.productImage.delete({ where: { id: imageId } });
    await this.revisions?.markPendingFromLive(image.productId);
    return {
      message: release.deleted
        ? 'Imagen eliminada exitosamente'
        : 'Imagen eliminada; los bytes se conservan porque siguen referenciados',
      retained: !release.deleted,
    };
  }

  /**
   * Actualiza metadatos de una imagen (alt, isPrimary y/o type).
   * Si isPrimary: true, desmarca primero cualquier otra imagen principal del
   * mismo producto (updateMany isPrimary=false) y marca esta (transacción).
   * 404 si la imagen no existe. Audita con entity 'ProductImage', action 'update'.
   */
  async updateImage(
    imageId: string,
    dto: { alt?: string; isPrimary?: boolean; type?: ProductImageType },
    ctx?: AccessContext,
  ) {
    this.library.assertWritesAllowed();
    const image = await this.prisma.productImage.findUnique({ where: { id: imageId } });
    if (!image) throw new NotFoundException('Imagen no encontrada');

    if (ctx) await this.assertCatalogProductAction(image.productId, 'products:write', ctx);

    const result = await this.writeTransaction(async (tx) => {
      if (this.library.config.mode === 'dedicated') await tx.$queryRaw`SELECT id FROM products WHERE id=${image.productId} FOR UPDATE`;
      if (dto.isPrimary === true) {
        await tx.productImage.updateMany({
          where: { productId: image.productId, isPrimary: true },
          data: { isPrimary: false },
        });
      }

      const result = await tx.productImage.update({
        where: { id: imageId },
        data: {
          ...(dto.alt !== undefined && { alt: dto.alt }),
          ...(dto.isPrimary !== undefined && { isPrimary: dto.isPrimary }),
          ...(dto.type !== undefined && { type: dto.type }),
        },
      });
      if (this.library.config.mode === 'dedicated') {
        await this.revisions?.markPendingFromLive(image.productId, tx as unknown as LibraryPrisma.TransactionClient, { id: ctx?.userId });
      }
      await this.appendLibraryEvent(tx, 'PRODUCT_IMAGE_UPDATED', 'ProductImage', imageId, { productId: image.productId, before: { alt: image.alt, isPrimary: image.isPrimary, type: image.type }, after: { alt: result.alt, isPrimary: result.isPrimary, type: result.type } }, ctx);
      return result;
    });

    if (this.library.config.mode === 'legacy') {
      await this.revisions?.markPendingFromLive(image.productId);
      await this.audit.log({
      userId: ctx?.userId,
      action: 'update',
      entity: 'ProductImage',
      entityId: imageId,
      oldValues: {
        productId: image.productId,
        url: image.url,
        alt: image.alt,
        isPrimary: image.isPrimary,
        type: image.type,
        sortOrder: image.sortOrder,
      },
      newValues: {
        productId: image.productId,
        url: result.url,
        alt: result.alt,
        isPrimary: result.isPrimary,
        type: result.type,
        sortOrder: result.sortOrder,
      },
      });
    }

    return result;
  }

  /**
   * Resuelve la Lista a la que pertenece un producto.
   * Si se envía listaId, valida su existencia; si falta, asigna LISTA-GENERAL (fallback documentado).
   * Retorna también defaultVisibility para propagarla al crear productos sin isVisible explícito.
   * [decisiones 8/14]
   */
  private async resolveLista(listaId?: string): Promise<{ id: string; defaultVisibility: boolean }> {
    if (listaId) {
      const lista = await this.prisma.lista.findUnique({
        where: { id: listaId },
        select: { id: true, defaultVisibility: true },
      });
      if (!lista) throw new NotFoundException('Lista no encontrada');
      return lista;
    }

    const defaultLista = await this.prisma.lista.findUnique({
      where: { code: 'LISTA-GENERAL' },
      select: { id: true, defaultVisibility: true },
    });
    if (!defaultLista) throw new NotFoundException('Lista por defecto (LISTA-GENERAL) no encontrada');
    return defaultLista;
  }

  /**
   * Genera un nombre breve y determinístico a partir de una descripción técnica.
   * Se usa SOLO cuando no hay un `name` explícito en la fila de importación.
   * Función pura: no consulta la BD, no usa I/O ni servicios externos.
   * - No añade el SKU/referencia al resultado.
   * - No inventa atributos: solo resume texto presente en la descripción.
   * - Corta antes de frases de ficha técnica secundaria; nunca parte palabras;
   *   nunca supera los 120 caracteres.
   */
  private deriveNameFromDescription(description: string): string | null {
    const HEADER_ARTIFACTS = ['TITLE HIKVISION TURBO'];
    const CUT_PHRASES = [
      'Compatible',
      'Admite',
      'Soporta',
      'Clasificación',
      'Compresión',
      'Entradas',
      'Capacidad',
      'Tecnología',
      'Protección',
      'Grabación',
    ];
    const MIN_USEFUL_BEFORE = 12;
    const MAX_LENGTH = 120;

    // 1-2. Normalizar espacios, tabs y saltos de línea a un único espacio;
    // preserva el contenido técnico (SKU, unidades, resoluciones, tecnologías).
    const normalized = normalizeText(description);
    if (!normalized) return null;

    // 3. Quitar artefactos de encabezado/separador (aislados o incrustados).
    let candidate = normalized;
    for (const artifact of HEADER_ARTIFACTS) {
      candidate = candidate
        .replace(new RegExp(this.escapeRegExp(artifact), 'gi'), ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    // 4. Rechazar si tras la limpieza queda vacío o sin letras/números.
    if (!candidate || !/[a-zA-Z0-9]/.test(candidate)) return null;

    // 5. Primer fragmento comercial útil: cortar antes de la primera frase de
    // ficha técnica (case-insensitive). Solo se usa el corte si deja un
    // fragmento descriptivo útil (>= 12 caracteres).
    const lower = candidate.toLowerCase();
    let cutIndex = -1;
    for (const phrase of CUT_PHRASES) {
      const idx = lower.indexOf(phrase.toLowerCase());
      if (idx !== -1 && (cutIndex === -1 || idx < cutIndex)) cutIndex = idx;
    }
    let nameCandidate = candidate;
    if (cutIndex !== -1) {
      const before = candidate.slice(0, cutIndex).trim();
      if (before.length >= MIN_USEFUL_BEFORE) nameCandidate = before;
    }

    // 6. Limitar a 120 caracteres sin partir palabras.
    if (nameCandidate.length > MAX_LENGTH) {
      const slice = nameCandidate.slice(0, MAX_LENGTH);
      const lastBreak = Math.max(
        slice.lastIndexOf(' '),
        slice.lastIndexOf(','),
        slice.lastIndexOf(';'),
        slice.lastIndexOf('.'),
      );
      nameCandidate = lastBreak > 0 ? slice.slice(0, lastBreak) : slice;
    }

    // 7. trim final y limpiar puntuación/conectores incompletos al final.
    nameCandidate = nameCandidate.trim().replace(/[\s,;.\-–—]+$/, '').trim();

    // 8. null si quedó vacío o inválido.
    if (!nameCandidate || !/[a-zA-Z0-9]/.test(nameCandidate)) return null;
    return nameCandidate;
  }

  /** Escapa metacaracteres de regex para usar un literal en `new RegExp`. */
  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  async importFromExcel(file: Buffer, ctx?: AccessContext) {
    this.library.assertWritesAllowed();
    if (!file) {
      throw new BadRequestException('No se proporcionó archivo');
    }

    // Mitigación ReDoS xlsx (GHSA-5pgg-2g8v-p4x9): límite 10MB ya en excel-adapter; aquí también
    if (file.length > 10 * 1024 * 1024) {
      throw new BadRequestException('Archivo excede 10MB');
    }

    const workbook = XLSX.read(file, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    let rows = XLSX.utils.sheet_to_json(sheet) as Record<string, unknown>[];
    // Mitigación Prototype Pollution (GHSA-4r6h-8v6p-xvw6): sanitizar keys peligrosas
    rows = rows.map((r) => {
      const clean = Object.create(null) as Record<string, unknown>;
      for (const [k, v] of Object.entries(r as Record<string, unknown>)) {
        if (['__proto__', 'constructor', 'prototype'].includes(k)) continue;
        clean[k] = v;
      }
      return clean;
    });

    if (rows.length === 0) {
      throw new BadRequestException('El archivo está vacío');
    }

    const results = {
      total: rows.length,
      created: 0,
      skipped: 0,
      errors: [] as { row: number; sku: string; error: string }[],
      /** Unknown category/brand labels: nothing was created; the product is an unclassified draft until a person confirms them. */
      needsConfirmation: [] as { row: number; sku: string; code: 'CATEGORY_NEEDS_CONFIRMATION' | 'BRAND_NEEDS_CONFIRMATION'; label: string }[],
    };
    const labelCache = new Map<string, any>();

    // Fallback explícito documentado: LISTA-GENERAL (lista semilla) para productos importados.
    const defaultLista = await this.prisma.lista.findUnique({
      where: { code: 'LISTA-GENERAL' },
      select: { id: true },
    });
    const defaultListaId = defaultLista?.id ?? null;


    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] as any;
      const rowNum = i + 2; // Excel row number (1-based + header)

      try {
        // Map Excel columns to product fields
        // Expected columns: SKU, Nombre, Descripción, Categoría, Marca.
        // REFERENCIA/SKU se persiste SOLO como `sku`; nunca se concatena a `name`.
        const sku = String(row['SKU'] || row['sku'] || row['Código'] || row['codigo'] || '').trim();

        // rawName: SOLO la columna de nombre explícita. Si está vacía, no se usa.
        const rawName = String(row['Nombre'] || row['nombre'] || row['Name'] || row['name'] || '').trim();

        // rawDescription: columna de descripción (fuente íntegra de `description`).
        const rawDescription = String(row['Descripción'] || row['descripcion'] || row['Description'] || row['description'] || '').trim();

        // name: prevalece el nombre explícito (solo se normalizan espacios). Si no
        // existe un nombre útil, se deriva un nombre breve desde la descripción.
        // El SKU/referencia NUNCA se concatena al nombre.
        const name = rawName
          ? normalizeText(rawName)
          : rawDescription
            ? (this.deriveNameFromDescription(rawDescription) ?? '')
            : '';

        // description: se conserva completa, normalizando espacios; NO se reemplaza
        // por el nombre generado ni por el SKU.
        const description = rawDescription ? normalizeText(rawDescription) : '';
        const categoryName = String(row['Categoría'] || row['categoria'] || row['Category'] || row['category'] || '').trim();
        const brandName = String(row['Marca'] || row['marca'] || row['Brand'] || row['brand'] || '').trim();

        // Validate required fields
        if (!sku) {
          results.errors.push({ row: rowNum, sku: 'N/A', error: 'SKU vacío' });
          results.skipped++;
          continue;
        }

        if (!name) {
          results.errors.push({ row: rowNum, sku, error: 'Nombre vacío' });
          results.skipped++;
          continue;
        }

        // Sin categoría o marca en la celda: se rechaza la fila como siempre (no se inventa ninguna).
        if (!categoryName) {
          results.errors.push({ row: rowNum, sku, error: 'Categoría no especificada' });
          results.skipped++;
          continue;
        }
        if (!brandName) {
          results.errors.push({ row: rowNum, sku, error: 'Marca no especificada' });
          results.skipped++;
          continue;
        }

        // Check if SKU already exists
        const existingProduct = await findProductBySku(this.prisma, sku, { sku: true });
        if (existingProduct) {
          results.errors.push({ row: rowNum, sku, error: 'SKU ya existe' });
          results.skipped++;
          continue;
        }

        // Solo se consultan las existentes: una categoría o marca desconocida NO se crea; la fila entra como borrador por clasificar.
        const dbForLookup = this.prisma as unknown as ClassificationDb;
        const categoryMatch = await this.classification.resolveExistingCategory(dbForLookup, categoryName, {}, labelCache);
        const brandMatch = await this.classification.resolveExistingBrand(dbForLookup, brandName, labelCache);

        await this.writeTransaction(async (tx) => {
          // Existing category: derive its subcategory when there is one. Coherence goes through ClassificationService (conflict -> row error).
          const classified = await this.classification.assertWritable(tx as unknown as ClassificationDb, { categoryId: categoryMatch.entity?.id, brandId: brandMatch.entity?.id ?? null });
          const product = await tx.product.create({
            data: {
              sku,
              name,
              description: description || null,
              ...this.classification.toData(classified),
              brandId: brandMatch.entity?.id ?? null,
              listaId: defaultListaId,
              lifecycleStatus: 'DRAFT',
              isActive: false,
              isVisible: false,
            },
          });
          await this.appendLibraryEvent(tx, 'PRODUCT_CREATED', 'Product', product.id, { sku: product.sku, name: product.name, source: 'EXCEL_IMPORT' }, ctx);
        });

        results.created++;
        for (const issue of [categoryMatch.issue, brandMatch.issue]) {
          if (issue) results.needsConfirmation.push({ row: rowNum, sku, code: issue.code, label: issue.label });
        }
      } catch (error) {
        results.errors.push({
          row: rowNum,
          sku: row['SKU'] || row['sku'] || 'N/A',
          error: error.message || 'Error desconocido',
        });
        results.skipped++;
      }
    }

    return results;
  }

  /**
   * Verifica si la Lista del producto est\u00E1 pendiente de eliminaci\u00F3n (PENDING_DELETION).
   * Accede a la columna real `deletionStatus` que el cliente Prisma generado
   * en este entorno a\u00FAn no tipa (prisma generate no ejecutado); el cast estrecho
   * refleja la columna real definida en schema.prisma.
   */

  /**
   * Programacion masiva de publicacion (productIds explicitos).
   * Reutiliza schedulePublication por producto y agrega resultados por producto.
   */
  async schedulePublicationBulk(
    ids: string[],
    dto: BulkSchedulePublicationDto,
    ctx: AccessContext,
  ): Promise<{
    processed: number;
    succeeded: number;
    skipped: number;
    failed: number;
    results: Array<{
      productId: string;
      sku?: string;
      status: "SUCCESS" | "SKIPPED" | "ERROR";
      code?: string;
      message: string;
    }>;
  }> {
    this.library.assertWritesAllowed();
    const results: Array<{
      productId: string;
      sku?: string;
      status: "SUCCESS" | "SKIPPED" | "ERROR";
      code?: string;
      message: string;
    }> = [];
    let succeeded = 0;
    let skipped = 0;
    let failed = 0;
    for (const productId of ids) {
      const product = await this.prisma.product.findUnique({
        where: { id: productId },
        select: { id: true, sku: true, listaId: true, publishStatus: true, lifecycleStatus: true },
      });
      if (!product) {
        failed++;
        results.push({
          productId,
          status: "ERROR",
          code: "PRODUCT_NOT_FOUND",
          message: "Producto no encontrado",
        });
        continue;
      }
      if (await this.isListaPendingDeletion(product.listaId)) {
        skipped++;
        results.push({
          productId,
          sku: product.sku,
          status: "SKIPPED",
          code: "LISTA_PENDIENTE_ELIMINACION",
          message: "La lista esta pendiente de eliminacion y no permite cambios.",
        });
        continue;
      }
      const status = this.effectiveLifecycleStatus(product);
      if (status !== "DRAFT") {
        skipped++;
        results.push({
          productId,
          sku: product.sku,
          status: "SKIPPED",
          code: "NOT_ELIGIBLE",
          message: "Estado " + status + " no permite programar publicacion",
        });
        continue;
      }
      try {
        await this.schedulePublication(productId, { publishAt: dto.publishAt }, ctx);
        succeeded++;
        results.push({
          productId,
          sku: product.sku,
          status: "SUCCESS",
          message: "Publicacion programada",
        });
      } catch (error) {
        failed++;
        results.push({
          productId,
          sku: product.sku,
          status: "ERROR",
          code: "SCHEDULE_FAILED",
          message: error instanceof Error ? error.message : "Error interno",
        });
      }
    }
    const agg: "SUCCESS" | "WARNING" | "ERROR" =
      succeeded > 0 && (skipped > 0 || failed > 0) ? "WARNING" :
      failed > 0 && succeeded === 0 ? "ERROR" : "SUCCESS";
    await this.batchAudit({
      userId: ctx.userId,
      action: "schedule_publish_bulk",
      entity: "Product",
      entityId: ids.join(","),
      newValues: { publishAt: dto.publishAt, succeeded, skipped, failed },
      result: agg,
    }, ctx, ids);
    return { processed: ids.length, succeeded, skipped, failed, results };
  }

  /**
   * Cancelacion masiva de publicacion programada (productIds explicitos).
   * No despublica productos ya publicados; solo anula programacion pendiente en DRAFT.
   */
  async cancelPublicationBulk(
    ids: string[],
    ctx: AccessContext,
  ): Promise<{
    processed: number;
    succeeded: number;
    skipped: number;
    failed: number;
    results: Array<{
      productId: string;
      sku?: string;
      status: "SUCCESS" | "SKIPPED" | "ERROR";
      code?: string;
      message: string;
    }>;
  }> {
    this.library.assertWritesAllowed();
    const results: Array<{
      productId: string;
      sku?: string;
      status: "SUCCESS" | "SKIPPED" | "ERROR";
      code?: string;
      message: string;
    }> = [];
    let succeeded = 0;
    let skipped = 0;
    let failed = 0;
    for (const productId of ids) {
      const product = await this.prisma.product.findUnique({
        where: { id: productId },
        select: { id: true, sku: true, listaId: true, lifecycleStatus: true, publishAt: true },
      });
      if (!product) {
        failed++;
        results.push({ productId, status: "ERROR", code: "PRODUCT_NOT_FOUND", message: "Producto no encontrado" });
        continue;
      }
      if (await this.isListaPendingDeletion(product.listaId)) {
        skipped++;
        results.push({ productId, sku: product.sku, status: "SKIPPED", code: "LISTA_PENDIENTE_ELIMINACION", message: "La lista esta pendiente de eliminacion y no permite cambios." });
        continue;
      }
      try {
        await this.cancelScheduledPublication(productId, ctx);
        succeeded++;
        results.push({ productId, sku: product.sku, status: "SUCCESS", message: "Programacion cancelada" });
      } catch (error) {
        skipped++;
        results.push({ productId, sku: product.sku, status: "SKIPPED", code: "NOT_ACTIVE_SCHEDULE", message: error instanceof Error ? error.message : "Sin programacion activa" });
      }
    }
    const agg: "SUCCESS" | "WARNING" | "ERROR" =
      succeeded > 0 && (skipped > 0 || failed > 0) ? "WARNING" :
      failed > 0 && succeeded === 0 ? "ERROR" : "SUCCESS";
    await this.batchAudit({
      userId: ctx.userId,
      action: "cancel_schedule_publish_bulk",
      entity: "Product",
      entityId: ids.join(","),
      newValues: { succeeded, skipped, failed },
      result: agg,
    }, ctx, ids);
    return { processed: ids.length, succeeded, skipped, failed, results };
  }

  /** Resultado consolidado de una operacion sobre una Lista completa. */
  async publishListaProducts(
    listaId: string,
    ctx: AccessContext,
  ): Promise<ListaPublicationBatchResult> {
    this.library.assertWritesAllowed();
    await this.assertListaPublishable(listaId, ctx);
    const products = (await this.prisma.product.findMany({
      where: { listaId },
      select: { id: true, sku: true },
    })) ?? [];
    const results: ListaPublicationBatchResult['results'] = [];
    let succeeded = 0;
    let skipped = 0;
    let failed = 0;
    for (const p of products) {
      const product = await this.prisma.product.findUnique({ where: { id: p.id } });
      if (!product) { failed++; results.push({ productId: p.id, sku: p.sku, status: 'ERROR', code: 'PRODUCT_NOT_FOUND', message: 'Producto no encontrado' }); continue; }
      const status = this.effectiveLifecycleStatus(product);
      if (status !== 'DRAFT') {
        skipped++;
        results.push({ productId: p.id, sku: p.sku, status: 'SKIPPED', code: 'NOT_ELIGIBLE', message: `Estado ${status} no permite publicar` });
        continue;
      }
      try {
        await this.doTransition(p.id, { event: 'PUBLISH' }, ctx, false);
        succeeded++;
        results.push({ productId: p.id, sku: p.sku, status: 'SUCCESS', message: 'Publicado' });
      } catch (error) {
        if (error instanceof ConflictException || error instanceof BadRequestException) {
          skipped++;
          results.push({ productId: p.id, sku: p.sku, status: 'SKIPPED', code: 'NOT_ELIGIBLE', message: error.message });
        } else {
          failed++;
          results.push({ productId: p.id, sku: p.sku, status: 'ERROR', code: 'PUBLISH_FAILED', message: error instanceof Error ? error.message : 'Error interno' });
        }
      }
    }
    const result = this.aggregateResult(succeeded, skipped, failed);
    await this.batchAudit({
      userId: ctx.userId,
      action: 'publicar_lista',
      entity: 'LISTA',
      entityId: listaId,
      newValues: { processed: products.length, succeeded, skipped, failed },
      result,
    }, ctx);
    return { listaId, processed: products.length, succeeded, skipped, failed, results };
  }

  /** Programa la publicacion de una Lista completa (solo productos elegibles). */
  async scheduleListaProducts(
    listaId: string,
    dto: SchedulePublicationDto,
    ctx: AccessContext,
  ): Promise<ListaPublicationBatchResult> {
    this.library.assertWritesAllowed();
    await this.assertListaPublishable(listaId, ctx);
    const products = (await this.prisma.product.findMany({
      where: { listaId },
      select: { id: true, sku: true },
    })) ?? [];
    const results: ListaPublicationBatchResult['results'] = [];
    let succeeded = 0;
    let skipped = 0;
    let failed = 0;
    for (const p of products) {
      const product = await this.prisma.product.findUnique({ where: { id: p.id } });
      if (!product) { failed++; results.push({ productId: p.id, sku: p.sku, status: 'ERROR', code: 'PRODUCT_NOT_FOUND', message: 'Producto no encontrado' }); continue; }
      const status = this.effectiveLifecycleStatus(product);
      if (status !== 'DRAFT') {
        skipped++;
        results.push({ productId: p.id, sku: p.sku, status: 'SKIPPED', code: 'NOT_ELIGIBLE', message: `Estado ${status} no permite programar` });
        continue;
      }
      try {
        await this.schedulePublication(p.id, dto, ctx);
        succeeded++;
        results.push({ productId: p.id, sku: p.sku, status: 'SUCCESS', message: 'Programada' });
      } catch (error) {
        if (error instanceof ConflictException || error instanceof BadRequestException) {
          skipped++;
          results.push({ productId: p.id, sku: p.sku, status: 'SKIPPED', code: 'NOT_ELIGIBLE', message: error.message });
        } else {
          failed++;
          results.push({ productId: p.id, sku: p.sku, status: 'ERROR', code: 'SCHEDULE_FAILED', message: error instanceof Error ? error.message : 'Error interno' });
        }
      }
    }
    const result = this.aggregateResult(succeeded, skipped, failed);
    await this.batchAudit({
      userId: ctx.userId,
      action: 'schedule_lista',
      entity: 'LISTA',
      entityId: listaId,
      newValues: { publishAt: dto.publishAt, processed: products.length, succeeded, skipped, failed },
      result,
    }, ctx);
    return { listaId, processed: products.length, succeeded, skipped, failed, results };
  }

  /** Cancela programaciones pendientes de productos de una Lista (no despublica publicados). */
  async cancelListaSchedules(
    listaId: string,
    ctx: AccessContext,
  ): Promise<ListaPublicationBatchResult> {
    this.library.assertWritesAllowed();
    await this.assertListaPublishable(listaId, ctx);
    const products = (await this.prisma.product.findMany({
      where: { listaId, publishAt: { not: null } },
      select: { id: true, sku: true },
    })) ?? [];
    if (products.length === 0) {
      await this.batchAudit({
        userId: ctx.userId,
        action: 'cancel_schedule_lista',
        entity: 'LISTA',
        entityId: listaId,
        newValues: { processed: 0, succeeded: 0, skipped: 0, failed: 0 },
        result: 'SUCCESS',
      }, ctx);
      return { listaId, processed: 0, succeeded: 0, skipped: 0, failed: 0, results: [] };
    }
    const results: ListaPublicationBatchResult['results'] = [];
    let succeeded = 0;
    let skipped = 0;
    let failed = 0;
    for (const p of products) {
      try {
        await this.cancelScheduledPublication(p.id, ctx);
        succeeded++;
        results.push({ productId: p.id, sku: p.sku, status: 'SUCCESS', message: 'Programacion cancelada' });
      } catch (error) {
        if (error instanceof ConflictException) {
          skipped++;
          results.push({ productId: p.id, sku: p.sku, status: 'SKIPPED', code: 'NOT_ACTIVE_SCHEDULE', message: error.message });
        } else {
          failed++;
          results.push({ productId: p.id, sku: p.sku, status: 'ERROR', code: 'CANCEL_FAILED', message: error instanceof Error ? error.message : 'Error interno' });
        }
      }
    }
    const result = this.aggregateResult(succeeded, skipped, failed);
    await this.batchAudit({
      userId: ctx.userId,
      action: 'cancel_schedule_lista',
      entity: 'LISTA',
      entityId: listaId,
      newValues: { processed: products.length, succeeded, skipped, failed },
      result,
    }, ctx);
    return { listaId, processed: products.length, succeeded, skipped, failed, results };
  }

  /** Autorizacion y estado de una Lista para operaciones de publicacion. */
  private async assertListaPublishable(listaId: string, ctx: AccessContext): Promise<void> {
    if (!ctx.userId) throw new ForbiddenException('Usuario no autenticado');
    const lista = await this.prisma.lista.findUnique({
      where: { id: listaId },
      select: { id: true, isActive: true, archivedAt: true },
    });
    if (!lista || !lista.isActive || lista.archivedAt) throw new NotFoundException('Lista no encontrada');
    if (await this.isListaPendingDeletion(listaId)) {
      throw new ConflictException({
        code: 'LISTA_PENDIENTE_ELIMINACION',
        message: 'La Lista esta pendiente de eliminacion y no permite cambios.',
      });
    }
    if (!this.acl.isListasAdmin(ctx.roles)) {
      await this.acl.assertListaAccess(listaId, ctx, 'manage');
    }
  }

  /** Clasifica el resultado agregado de un lote. */
  private aggregateResult(
    succeeded: number,
    skipped: number,
    failed: number,
  ): 'SUCCESS' | 'WARNING' | 'ERROR' {
    if (succeeded === 0) return 'ERROR';
    if (skipped > 0 || failed > 0) return 'WARNING';
    return 'SUCCESS';
  }
  private async isListaPendingDeletion(listaId: string | null): Promise<boolean> {
    if (!listaId) return false;
    const row = (await this.prisma.lista.findUnique({
      where: { id: listaId },
    })) as unknown as { deletionStatus: string | null } | null;
    return row?.deletionStatus === "PENDING_DELETION";
  }
}
